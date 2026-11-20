import { describe, expect, it } from 'vitest';

import { Alarm, hasFreshPrice, PriceUpdate } from '../domain/alarm';
import { evaluateAlarm, resetAlarmState } from '../domain/alarmStateMachine';

const now = '2026-11-18T20:00:00.000Z';
const nowMs = Date.parse(now);

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: 'a1',
    ticker: 'NVDA',
    targetPrice: 180,
    percentageRange: 2,
    lowerThreshold: 176.4,
    upperThreshold: 183.6,
    enabled: true,
    state: 'ARMED',
    lastObservedPrice: null,
    lastPriceSource: null,
    lastPriceUpdateTimestamp: null,
    lastTriggeredTimestamp: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function update(price: number, timestamp = now, ticker = 'NVDA'): PriceUpdate {
  return { ticker, price, timestamp, source: 'DEMO', session: 'regular' };
}

describe('alarm state machine', () => {
  it('only treats a fresh price from the selected provider as current', () => {
    const oldDemoPrice = alarm({
      lastObservedPrice: 180.09,
      lastPriceSource: 'DEMO',
      lastPriceUpdateTimestamp: now,
    });
    expect(hasFreshPrice(oldDemoPrice, 'Alpaca IEX', nowMs)).toBe(false);
    expect(hasFreshPrice({
      ...oldDemoPrice,
      lastPriceSource: 'Alpaca IEX',
    }, 'Alpaca IEX', nowMs)).toBe(true);
    expect(hasFreshPrice({
      ...oldDemoPrice,
      lastPriceSource: 'Alpaca IEX',
      lastPriceUpdateTimestamp: '2026-11-18T19:59:00.000Z',
    }, 'Alpaca IEX', nowMs)).toBe(false);
  });

  it('remains armed below range', () => {
    const result = evaluateAlarm(alarm(), update(175), 30_000, nowMs);
    expect(result.triggered).toBe(false);
    expect(result.alarm.state).toBe('ARMED');
  });

  it('triggers once entering from below', () => {
    const first = evaluateAlarm(alarm(), update(175), 30_000, nowMs);
    const entered = evaluateAlarm(first.alarm, update(180), 30_000, nowMs);
    expect(entered.triggered).toBe(true);
    expect(entered.alarm.state).toBe('TRIGGERED');
  });

  it('does not trigger again while inside', () => {
    const entered = evaluateAlarm(alarm(), update(180), 30_000, nowMs);
    const duplicate = evaluateAlarm(entered.alarm, update(181), 30_000, nowMs);
    expect(duplicate.triggered).toBe(false);
  });

  it('re-arms when exiting above and triggers on re-entry', () => {
    const entered = evaluateAlarm(alarm(), update(180), 30_000, nowMs);
    const exited = evaluateAlarm(entered.alarm, update(185), 30_000, nowMs);
    expect(exited.alarm.state).toBe('ARMED');
    const reentered = evaluateAlarm(exited.alarm, update(182), 30_000, nowMs);
    expect(reentered.triggered).toBe(true);
  });

  it('triggers when entering from above', () => {
    const result = evaluateAlarm(alarm({ lastObservedPrice: 185, state: 'ARMED' }), update(183), 30_000, nowMs);
    expect(result.triggered).toBe(true);
  });

  it('re-arms below and triggers again on re-entry', () => {
    const entered = evaluateAlarm(alarm(), update(180), 30_000, nowMs);
    const exited = evaluateAlarm(entered.alarm, update(175), 30_000, nowMs);
    const reentered = evaluateAlarm(exited.alarm, update(177), 30_000, nowMs);
    expect(reentered.triggered).toBe(true);
  });

  it('disabled alarms never trigger', () => {
    const result = evaluateAlarm(alarm({ enabled: false }), update(180), 30_000, nowMs);
    expect(result.triggered).toBe(false);
  });

  it('evaluates multiple alarms independently', () => {
    const tight = alarm({ id: 'tight', percentageRange: 1, lowerThreshold: 178.2, upperThreshold: 181.8 });
    const wide = alarm({ id: 'wide', percentageRange: 5, lowerThreshold: 171, upperThreshold: 189 });
    expect(evaluateAlarm(tight, update(175), 30_000, nowMs).triggered).toBe(false);
    expect(evaluateAlarm(wide, update(175), 30_000, nowMs).triggered).toBe(true);
  });

  it('does not trigger for a jump across the range', () => {
    const below = evaluateAlarm(alarm(), update(175), 30_000, nowMs);
    const jumped = evaluateAlarm(below.alarm, update(185), 30_000, nowMs);
    expect(jumped.triggered).toBe(false);
  });

  it('ignores duplicate price values', () => {
    const first = evaluateAlarm(alarm(), update(180), 30_000, nowMs);
    const duplicate = evaluateAlarm(first.alarm, update(180, '2026-11-18T20:00:01.000Z'), 30_000, nowMs);
    expect(duplicate.triggered).toBe(false);
  });

  it('ignores stale prices', () => {
    const stale = evaluateAlarm(alarm(), update(180, '2026-11-18T19:59:00.000Z'), 30_000, nowMs);
    expect(stale.triggered).toBe(false);
  });

  it('ignores future-dated prices', () => {
    const future = evaluateAlarm(alarm(), update(180, '2026-11-18T20:01:00.000Z'), 30_000, nowMs);
    expect(future.triggered).toBe(false);
  });

  it('triggers immediately when a fresh quote snapshot arrives in range', () => {
    const snapshot = {
      ...update(180),
      source: 'Alpaca IEX midpoint',
      isSnapshot: true,
    };
    const result = evaluateAlarm(alarm(), snapshot, 30_000, nowMs);
    expect(result.triggered).toBe(true);
    expect(result.alarm.lastPriceSource).toBe('Alpaca IEX midpoint');
  });

  it('threshold edits reset without notification', () => {
    const edited = alarm({ lowerThreshold: 179, upperThreshold: 181, lastObservedPrice: 180 });
    const reset = resetAlarmState(edited);
    expect(reset.state).toBe('TRIGGERED');
  });

  it('re-enabling inside range does not trigger immediately', () => {
    const reenabled = resetAlarmState(alarm({ enabled: true, state: 'ARMED', lastObservedPrice: 180 }));
    expect(reenabled.state).toBe('TRIGGERED');
  });
});
