import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { getIsOnboarded } from '@/constants/onboarding';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  // Read the persisted onboarding flag once on launch.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const value = await getIsOnboarded();
        if (mounted) setOnboarded(value);
      } finally {
        if (mounted) setReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch {
          // Splash may already be hidden — best effort.
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Gate: skip onboarding on return visits.
  useEffect(() => {
    if (!ready) return;
    const inTabs = segments[0] === '(tabs)';
    if (onboarded && !inTabs) {
      router.replace('/(tabs)');
    } else if (!onboarded && inTabs) {
      router.replace('/');
    }
  }, [ready, onboarded, segments, router]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
