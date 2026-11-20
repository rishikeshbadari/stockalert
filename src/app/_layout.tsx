import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { AlarmStoreProvider } from '@/store/alarmStore';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <AlarmStoreProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="alarm-form" options={{ presentation: 'modal', title: 'New Alarm' }} />
      </Stack>
    </AlarmStoreProvider>
  );
}
