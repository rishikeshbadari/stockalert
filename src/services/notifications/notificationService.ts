import * as Notifications from 'expo-notifications';
import { Alarm } from '@/domain/alarm';

export interface NotificationService {
  requestPermission(): Promise<boolean>;
  notifyEnteredRange(alarm: Alarm, price: number): Promise<void>;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const localNotificationService: NotificationService = {
  async requestPermission() {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return true;
    const result = await Notifications.requestPermissionsAsync();
    return result.status === 'granted';
  },
  async notifyEnteredRange(alarm, price) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${alarm.ticker} entered your price range`,
        body: `Current price: $${price.toFixed(2)}  |  Target: $${alarm.targetPrice.toFixed(2)} (±${alarm.percentageRange}%)`,
        sound: 'default',
      },
      trigger: null,
    });
  },
};
