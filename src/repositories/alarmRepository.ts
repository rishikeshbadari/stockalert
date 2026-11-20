import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alarm } from '@/domain/alarm';

export interface AlarmRepository {
  load(): Promise<Alarm[]>;
  save(alarms: Alarm[]): Promise<void>;
}

const KEY = '@stockalert/alarms/v1';

export const localAlarmRepository: AlarmRepository = {
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const alarms = JSON.parse(raw) as Alarm[];
    return Array.isArray(alarms) ? alarms : [];
  },
  async save(alarms) {
    await AsyncStorage.setItem(KEY, JSON.stringify(alarms));
  },
};
