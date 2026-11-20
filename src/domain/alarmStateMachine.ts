import { Alarm, PriceUpdate } from './alarm';

export interface EvaluationResult {
  alarm: Alarm;
  triggered: boolean;
}

export function isPriceInRange(alarm: Alarm, price: number) {
  return price >= alarm.lowerThreshold && price <= alarm.upperThreshold;
}

export function evaluateAlarm(
  alarm: Alarm,
  update: PriceUpdate,
  staleAfterMs = 30_000,
  nowMs = Date.now()
) {
  if (!alarm.enabled) return { alarm, triggered: false };
  if (alarm.ticker !== update.ticker.toUpperCase()) return { alarm, triggered: false };
  if (!Number.isFinite(update.price) || update.price <= 0) return { alarm, triggered: false };

  const updateMs = Date.parse(update.timestamp);
  const ageMs = nowMs - updateMs;
  if (!Number.isFinite(updateMs) || ageMs < 0 || ageMs > staleAfterMs) {
    return { alarm, triggered: false };
  }
  if (
    alarm.lastObservedPrice !== null &&
    alarm.lastObservedPrice === update.price &&
    alarm.lastPriceUpdateTimestamp === update.timestamp
  ) {
    return { alarm, triggered: false };
  }

  const inRange = isPriceInRange(alarm, update.price);
  let nextState = alarm.state;
  let triggered = false;

  if (!inRange) {
    nextState = 'ARMED';
  } else if (alarm.state === 'ARMED') {
    nextState = 'TRIGGERED';
    triggered = true;
  }

  return {
    alarm: {
      ...alarm,
      state: nextState,
      lastObservedPrice: update.price,
      lastPriceSource: update.source,
      lastPriceUpdateTimestamp: update.timestamp,
      lastTriggeredTimestamp: triggered ? update.timestamp : alarm.lastTriggeredTimestamp,
      updatedAt: update.timestamp,
    },
    triggered,
  } satisfies EvaluationResult;
}

export function resetAlarmState(alarm: Alarm) {
  if (!alarm.enabled) return { ...alarm, state: 'ARMED' as const };
  if (alarm.lastObservedPrice === null) return { ...alarm, state: 'ARMED' as const };
  return {
    ...alarm,
    state: (isPriceInRange(alarm, alarm.lastObservedPrice) ? 'TRIGGERED' : 'ARMED') as Alarm['state'],
  };
}
