import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alarm, hasFreshPrice } from '@/domain/alarm';
import { useAlarmStore } from '@/store/alarmStore';

function money(value: number | null) {
  return value === null ? 'Unavailable' : `$${value.toFixed(2)}`;
}

function pricePosition(alarm: Alarm, currentPrice: number | null, isFresh: boolean) {
  if (currentPrice === null) return 'Unavailable / stale';
  const position = currentPrice < alarm.lowerThreshold
    ? 'Below range'
    : currentPrice > alarm.upperThreshold
      ? 'Above range'
      : 'Inside range';
  return isFresh ? position : `${position} · stale`;
}

function formatUpdateTime(timestamp: string | null) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AlarmsScreen() {
  const store = useAlarmStore();
  const [now, setNow] = useState(0);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  const monitoringLabel = !store.foreground
    ? 'Monitoring paused'
    : store.connectionError
      ? 'Market data connection error'
      : store.connectionStatus === 'connected'
        ? store.dataSource === 'DEMO'
          ? 'Monitoring simulated prices'
          : 'Monitoring live prices'
        : store.connectionStatus === 'connecting'
          ? 'Connecting to market data'
          : 'Waiting for market data';

  const deleteAlarm = (alarm: Alarm) => {
    Alert.alert('Delete alarm?', `${alarm.ticker} at $${alarm.targetPrice.toFixed(2)} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void store.deleteAlarm(alarm.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Alarms</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, store.connectionStatus === 'connected' ? styles.dotGreen : store.connectionError ? styles.dotRed : styles.dotGray]} />
            <Text style={styles.statusText}>
              {store.connectionError ? 'Market data connection error' : monitoringLabel}
              {' · '}
              {store.dataSource}
            </Text>
          </View>
          {store.connectionMessage && (
            <Text style={[styles.connectionMessage, store.connectionError && styles.connectionMessageError]}>
              {store.connectionMessage}
            </Text>
          )}
        </View>
        <Pressable accessibilityLabel="Create alarm" style={styles.addButton} onPress={() => router.push('/alarm-form')}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, store.alarms.length === 0 && styles.emptyContent]}>
        {!store.loaded ? (
          <Text style={styles.emptyText}>Loading alarms…</Text>
        ) : store.alarms.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>$</Text></View>
            <Text style={styles.emptyTitle}>Create your first alarm</Text>
            <Text style={styles.emptyText}>Choose a ticker and price zone. We’ll notify you when the price enters it.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/alarm-form')}>
              <Text style={styles.primaryButtonText}>Add an alarm</Text>
            </Pressable>
          </View>
        ) : (
          store.alarms.map((alarm) => {
            const priceIsFresh = hasFreshPrice(alarm, store.priceSource, now);
            const hasMatchingSource = alarm.lastObservedPrice !== null && alarm.lastPriceSource === store.priceSource;
            const currentPrice = hasMatchingSource ? alarm.lastObservedPrice : null;
            const position = pricePosition(alarm, currentPrice, priceIsFresh);
            const positionInside = position.startsWith('Inside range');
            return (
              <Pressable key={alarm.id} style={styles.card} onPress={() => router.push({ pathname: '/alarm-form', params: { id: alarm.id } })}>
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.ticker}>{alarm.ticker}</Text>
                    <Text style={[styles.position, positionInside && styles.positionInside]}>{position}</Text>
                  </View>
                  <Switch
                    value={alarm.enabled}
                    onValueChange={() => void store.toggleAlarm(alarm.id)}
                    trackColor={{ false: '#D1D5DB', true: '#111827' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.details}>
                  <View style={styles.detailColumn}>
                    <Text style={styles.detailLabel}>TARGET</Text>
                    <Text style={styles.detailValue}>{money(alarm.targetPrice)}</Text>
                  </View>
                  <View style={styles.detailColumn}>
                    <Text style={styles.detailLabel}>RANGE</Text>
                    <Text style={styles.detailValue}>{money(alarm.lowerThreshold)} – {money(alarm.upperThreshold)}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.detailLabel}>{priceIsFresh ? 'CURRENT PRICE' : 'LAST PRICE'}</Text>
                    <Text style={styles.currentPrice}>{money(currentPrice)}</Text>
                    {currentPrice !== null && (
                      <Text style={styles.priceTimestamp}>
                        {store.priceSource} · {formatUpdateTime(alarm.lastPriceUpdateTimestamp)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <Text style={[styles.badge, alarm.state === 'TRIGGERED' ? styles.badgeTriggered : styles.badgeArmed]}>
                      {alarm.enabled ? alarm.state : 'DISABLED'}
                    </Text>
                    <Pressable accessibilityLabel={`Delete ${alarm.ticker}`} hitSlop={12} onPress={() => deleteAlarm(alarm)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', color: '#111827', letterSpacing: -1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotGreen: { backgroundColor: '#22C55E' },
  dotGray: { backgroundColor: '#9CA3AF' },
  dotRed: { backgroundColor: '#EF4444' },
  statusText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  connectionMessage: { color: '#92400E', fontSize: 12, lineHeight: 16, marginTop: 6, maxWidth: 280 },
  connectionMessageError: { color: '#B91C1C' },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#fff', fontSize: 30, lineHeight: 32, marginTop: -2 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 30, paddingBottom: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E8EAED', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyIconText: { fontSize: 30, fontWeight: '700', color: '#374151' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  emptyText: { color: '#6B7280', textAlign: 'center', lineHeight: 22, fontSize: 15 },
  primaryButton: { backgroundColor: '#111827', borderRadius: 14, marginTop: 24, height: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticker: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: 0.2 },
  position: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginTop: 3 },
  positionInside: { color: '#15803D' },
  details: { flexDirection: 'row', gap: 24, marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  detailColumn: { flex: 1 },
  detailLabel: { color: '#9CA3AF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  detailValue: { color: '#374151', fontSize: 14, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 },
  currentPrice: { color: '#111827', fontSize: 18, fontWeight: '800' },
  priceTimestamp: { color: '#9CA3AF', fontSize: 10, fontWeight: '600', marginTop: 3 },
  cardActions: { alignItems: 'flex-end', gap: 8 },
  badge: { overflow: 'hidden', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  badgeArmed: { color: '#374151', backgroundColor: '#F3F4F6' },
  badgeTriggered: { color: '#166534', backgroundColor: '#DCFCE7' },
  deleteText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
});
