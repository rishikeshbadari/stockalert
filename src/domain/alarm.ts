export type AlarmState = 'ARMED' | 'TRIGGERED';

export interface Alarm {
  id: string;
  ticker: string;
  targetPrice: number;
  percentageRange: number;
  lowerThreshold: number;
  upperThreshold: number;
  enabled: boolean;
  state: AlarmState;
  lastObservedPrice: number | null;
  lastPriceSource: string | null;
  lastPriceUpdateTimestamp: string | null;
  lastTriggeredTimestamp: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceUpdate {
  ticker: string;
  price: number;
  timestamp: string;
  source: string;
  isSnapshot?: boolean;
  session?: 'regular' | 'premarket' | 'afterhours' | 'overnight';
}

export function calculateThresholds(targetPrice: number, percentageRange: number) {
  return {
    lowerThreshold: targetPrice * (1 - percentageRange / 100),
    upperThreshold: targetPrice * (1 + percentageRange / 100),
  };
}

export function hasFreshPrice(
  alarm: Pick<Alarm, 'lastObservedPrice' | 'lastPriceSource' | 'lastPriceUpdateTimestamp'>,
  expectedSource: string,
  nowMs = Date.now(),
  maxAgeMs = 30_000
) {
  if (alarm.lastObservedPrice === null || alarm.lastPriceSource !== expectedSource) return false;
  const updatedAtMs = Date.parse(alarm.lastPriceUpdateTimestamp ?? '');
  const ageMs = nowMs - updatedAtMs;
  return Number.isFinite(updatedAtMs) && ageMs >= 0 && ageMs <= maxAgeMs;
}
