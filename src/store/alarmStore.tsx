import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { Alarm, calculateThresholds, PriceUpdate } from '@/domain/alarm';
import { evaluateAlarm, resetAlarmState } from '@/domain/alarmStateMachine';
import { localAlarmRepository } from '@/repositories/alarmRepository';
import { AlpacaMarketDataProvider } from '@/services/marketData/alpacaMarketDataProvider';
import { MockMarketDataProvider } from '@/services/marketData/mockMarketDataProvider';
import { ConnectionStatus, MarketDataProvider } from '@/services/marketData/marketDataProvider';
import { localNotificationService } from '@/services/notifications/notificationService';

interface AlarmStore {
  alarms: Alarm[];
  loaded: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: boolean;
  connectionMessage: string | null;
  dataSource: string;
  priceSource: string;
  foreground: boolean;
  addAlarm(input: { ticker: string; targetPrice: number; percentageRange: number }): Promise<void>;
  updateAlarm(id: string, input: { ticker: string; targetPrice: number; percentageRange: number }): Promise<void>;
  deleteAlarm(id: string): Promise<void>;
  toggleAlarm(id: string): Promise<void>;
  getAlarm(id: string): Alarm | undefined;
  requestNotifications(): Promise<boolean>;
}

const AlarmContext = createContext<AlarmStore | null>(null);
const alpacaKey = process.env.EXPO_PUBLIC_ALPACA_API_KEY ?? '';
const alpacaSecret = process.env.EXPO_PUBLIC_ALPACA_SECRET_KEY ?? '';
const alpacaFeed = process.env.EXPO_PUBLIC_ALPACA_FEED;
const configuredFeed = alpacaFeed === 'sip' || alpacaFeed === 'delayed_sip' ? alpacaFeed : 'iex';
const hasAlpacaCredentials = alpacaKey.length > 0 && alpacaSecret.length > 0;
const provider: MarketDataProvider = hasAlpacaCredentials
  ? new AlpacaMarketDataProvider(alpacaKey, alpacaSecret, configuredFeed)
  : new MockMarketDataProvider();
const dataSource = hasAlpacaCredentials
  ? `LIVE (${configuredFeed.toUpperCase()})`
  : 'DEMO';
const priceSource = hasAlpacaCredentials
  ? `Alpaca ${configuredFeed.toUpperCase()}`
  : 'DEMO';

function makeId() {
  return `alarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AlarmStoreProvider({ children }: { children: React.ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const alarmsRef = useRef(alarms);
  const latestPriceByTickerRef = useRef(new Map<string, PriceUpdate>());
  const enabledTickerKey = [...new Set(
    alarms.filter((alarm) => alarm.enabled).map((alarm) => alarm.ticker)
  )].sort().join(',');

  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  const persist = useCallback(async (next: Alarm[]) => {
    alarmsRef.current = next;
    setAlarms(next);
    await localAlarmRepository.save(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    void localAlarmRepository.load().then((saved) => {
      if (disposed) return;
      alarmsRef.current = saved;
      setAlarms(saved);
      setLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const unsubscribeStatus = provider.onStatusChange((status) => {
      setConnectionStatus(status);
      setConnectionMessage(provider.getErrorMessage());
    });
    const unsubscribePrices = provider.onPriceUpdate((update: PriceUpdate) => {
      const currentUpdate = latestPriceByTickerRef.current.get(update.ticker);
      if (!currentUpdate || Date.parse(update.timestamp) >= Date.parse(currentUpdate.timestamp)) {
        latestPriceByTickerRef.current.set(update.ticker, update);
      }
      const updateTime = Date.parse(update.timestamp);
      const snapshotIsStale = update.isSnapshot === true &&
        (!Number.isFinite(updateTime) || Date.now() - updateTime > 30_000 || updateTime > Date.now());
      const next = alarmsRef.current.map((alarm) => {
        if (alarm.ticker !== update.ticker) return alarm;
        if (snapshotIsStale && Number.isFinite(update.price) && update.price > 0) {
          return {
            ...alarm,
            lastObservedPrice: update.price,
            lastPriceSource: update.source,
            lastPriceUpdateTimestamp: update.timestamp,
          };
        }
        const result = evaluateAlarm(alarm, update);
        if (result.triggered) {
          void localNotificationService.notifyEnteredRange(result.alarm, update.price);
        }
        return result.alarm;
      });
      void persist(next);
    });
    return () => {
      unsubscribeStatus();
      unsubscribePrices();
    };
  }, [persist]);

  useEffect(() => {
    if (!loaded) return;
    const enabledTickers = enabledTickerKey ? enabledTickerKey.split(',') : [];
    provider.subscribe(enabledTickers);
  }, [enabledTickerKey, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const handleAppState = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setForeground(active);
      if (active) {
        const enabledTickers = [...new Set(
          alarmsRef.current.filter((alarm) => alarm.enabled).map((alarm) => alarm.ticker)
        )];
        void provider.connect().then(() => provider.subscribe(enabledTickers));
      } else {
        provider.disconnect();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    if (AppState.currentState === 'active') void provider.connect();
    return () => {
      subscription.remove();
      provider.disconnect();
    };
  }, [loaded]);

  const addAlarm = useCallback(async (input: { ticker: string; targetPrice: number; percentageRange: number }) => {
    const ticker = input.ticker.trim().toUpperCase();
    const thresholds = calculateThresholds(input.targetPrice, input.percentageRange);
    const now = new Date().toISOString();
    const alarm: Alarm = {
      id: makeId(),
      ticker,
      targetPrice: input.targetPrice,
      percentageRange: input.percentageRange,
      ...thresholds,
      enabled: true,
      state: 'ARMED',
      lastObservedPrice: null,
      lastPriceSource: null,
      lastPriceUpdateTimestamp: null,
      lastTriggeredTimestamp: null,
      createdAt: now,
      updatedAt: now,
    };
    const latestPrice = latestPriceByTickerRef.current.get(ticker);
    let alarmToSave = alarm;
    let triggered = false;
    if (latestPrice) {
      const result = evaluateAlarm(alarm, latestPrice);
      alarmToSave = result.alarm;
      triggered = result.triggered;
      if (latestPrice.isSnapshot && alarmToSave.lastPriceUpdateTimestamp === null) {
        alarmToSave = {
          ...alarmToSave,
          lastObservedPrice: latestPrice.price,
          lastPriceSource: latestPrice.source,
          lastPriceUpdateTimestamp: latestPrice.timestamp,
        };
      }
    }
    await persist([...alarmsRef.current, alarmToSave]);
    if (triggered && latestPrice) {
      await localNotificationService.notifyEnteredRange(alarmToSave, latestPrice.price);
    }
  }, [persist]);

  const updateAlarm = useCallback(async (id: string, input: { ticker: string; targetPrice: number; percentageRange: number }) => {
    const now = new Date().toISOString();
    const next = alarmsRef.current.map((alarm) => {
      if (alarm.id !== id) return alarm;
      const thresholds = calculateThresholds(input.targetPrice, input.percentageRange);
      const edited = {
        ...alarm,
        ticker: input.ticker.trim().toUpperCase(),
        targetPrice: input.targetPrice,
        percentageRange: input.percentageRange,
        ...thresholds,
        updatedAt: now,
      };
      return resetAlarmState(edited);
    });
    await persist(next);
  }, [persist]);

  const deleteAlarm = useCallback(async (id: string) => {
    await persist(alarmsRef.current.filter((alarm) => alarm.id !== id));
  }, [persist]);

  const toggleAlarm = useCallback(async (id: string) => {
    const next = alarmsRef.current.map((alarm) => {
      if (alarm.id !== id) return alarm;
      const toggled = { ...alarm, enabled: !alarm.enabled, updatedAt: new Date().toISOString() };
      return toggled.enabled ? resetAlarmState(toggled) : { ...toggled, state: 'ARMED' as const };
    });
    await persist(next);
  }, [persist]);

  const value = useMemo<AlarmStore>(() => ({
    alarms,
    loaded,
    connectionStatus,
    connectionError: connectionStatus === 'error',
    connectionMessage,
    dataSource,
    priceSource,
    foreground,
    addAlarm,
    updateAlarm,
    deleteAlarm,
    toggleAlarm,
    getAlarm: (id) => alarmsRef.current.find((alarm) => alarm.id === id),
    requestNotifications: localNotificationService.requestPermission,
  }), [alarms, loaded, connectionStatus, connectionMessage, foreground, addAlarm, updateAlarm, deleteAlarm, toggleAlarm]);

  return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export function useAlarmStore() {
  const context = useContext(AlarmContext);
  if (!context) throw new Error('useAlarmStore must be used inside AlarmStoreProvider');
  return context;
}
