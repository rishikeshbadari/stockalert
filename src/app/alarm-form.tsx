import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { calculateThresholds } from '@/domain/alarm';
import { useAlarmStore } from '@/store/alarmStore';

export default function AlarmFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const store = useAlarmStore();
  const existing = params.id ? store.getAlarm(params.id) : undefined;
  const [ticker, setTicker] = useState(existing?.ticker ?? '');
  const [target, setTarget] = useState(existing ? existing.targetPrice.toFixed(2) : '');
  const [range, setRange] = useState(existing ? existing.percentageRange.toString() : '');
  const [error, setError] = useState('');

  const targetNumber = Number(target);
  const rangeNumber = Number(range);
  const validPreview = targetNumber > 0 && rangeNumber >= 0 && Number.isFinite(targetNumber) && Number.isFinite(rangeNumber);
  const thresholds = validPreview ? calculateThresholds(targetNumber, rangeNumber) : null;

  const save = async () => {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) return setError('Enter a stock ticker.');
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(normalizedTicker)) return setError('Enter a valid US stock ticker.');
    if (!targetNumber || targetNumber <= 0) return setError('Target price must be greater than zero.');
    if (!Number.isFinite(rangeNumber) || rangeNumber <= 0 || rangeNumber > 100) return setError('Percentage range must be between 0 and 100.');
    setError('');
    await store.requestNotifications();
    if (existing) {
      await store.updateAlarm(existing.id, { ticker: normalizedTicker, targetPrice: targetNumber, percentageRange: rangeNumber });
    } else {
      await store.addAlarm({ ticker: normalizedTicker, targetPrice: targetNumber, percentageRange: rangeNumber });
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{existing ? 'Edit Alarm' : 'New Alarm'}</Text>
        <Text style={styles.subheading}>Set the price zone you want to watch.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Stock ticker</Text>
          <TextInput
            value={ticker}
            onChangeText={(value) => setTicker(value.toUpperCase())}
            placeholder="e.g. NVDA"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Target price</Text>
          <View style={styles.inputWithPrefix}>
            <Text style={styles.prefix}>$</Text>
            <TextInput
              value={target}
              onChangeText={setTarget}
              placeholder="180.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              style={styles.inputInline}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Range from target</Text>
          <View style={styles.inputWithPrefix}>
            <TextInput
              value={range}
              onChangeText={setRange}
              placeholder="2"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              style={styles.inputInline}
            />
            <Text style={styles.suffix}>%</Text>
          </View>
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>CALCULATED PRICE ZONE</Text>
          {thresholds ? (
            <View style={styles.previewRow}>
              <View><Text style={styles.previewCaption}>LOWER</Text><Text style={styles.previewValue}>${thresholds.lowerThreshold.toFixed(2)}</Text></View>
              <Text style={styles.previewDash}>—</Text>
              <View><Text style={styles.previewCaption}>UPPER</Text><Text style={styles.previewValue}>${thresholds.upperThreshold.toFixed(2)}</Text></View>
            </View>
          ) : (
            <Text style={styles.previewPlaceholder}>Enter a target and range</Text>
          )}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.saveButton} onPress={() => void save()}>
          <Text style={styles.saveText}>{existing ? 'Save Changes' : 'Save Alarm'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F6F7F9' },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subheading: { color: '#6B7280', fontSize: 15, marginTop: 6, marginBottom: 24 },
  field: { marginBottom: 18 },
  label: { color: '#374151', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { height: 56, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, fontSize: 18, color: '#111827', fontWeight: '700' },
  inputWithPrefix: { height: 56, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' },
  prefix: { color: '#6B7280', fontSize: 18, fontWeight: '700', paddingLeft: 16 },
  suffix: { color: '#6B7280', fontSize: 18, fontWeight: '700', paddingRight: 16 },
  inputInline: { flex: 1, height: '100%', paddingHorizontal: 12, fontSize: 18, color: '#111827', fontWeight: '700' },
  preview: { backgroundColor: '#111827', borderRadius: 16, padding: 18, marginTop: 4 },
  previewLabel: { color: '#9CA3AF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  previewCaption: { color: '#9CA3AF', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  previewValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  previewDash: { color: '#6B7280', fontSize: 18 },
  previewPlaceholder: { color: '#D1D5DB', marginTop: 12 },
  error: { color: '#DC2626', fontSize: 13, fontWeight: '700', marginTop: 14 },
  saveButton: { height: 56, backgroundColor: '#111827', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
