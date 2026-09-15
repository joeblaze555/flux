import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const FLUX_TIMER_CHANNEL_ID = 'flux-timer';

export const EXPIRY_TITLE = 'Flux — Focus Complete';
export const EXPIRY_BODY = 'Your session has ended. Step into stillness.';

type NotificationsModule = typeof import('expo-notifications');

let cachedModule: Promise<NotificationsModule | null> | null = null;
let handlerInstalled = false;

function isExpoGo(): boolean {
  try {
    return (Constants as { appOwnership?: string }).appOwnership === 'expo';
  } catch {
    return false;
  }
}

/**
 * Lazily load expo-notifications.
 *
 * Per https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ remote
 * functionality is unavailable in Expo Go on Android since SDK 53, and the
 * native module throws on import there. A static `import * as Notifications`
 * therefore redboxes the whole app (see useTimerEngine -> index crash).
 * Dynamic import here is catchable, and we skip the load entirely in
 * Android Expo Go so the timer still works in-app with no banner.
 */
function loadNotifications(): Promise<NotificationsModule | null> {
  if (!cachedModule) {
    cachedModule = (async () => {
      if (Platform.OS === 'android' && isExpoGo()) return null;
      try {
        return await import('expo-notifications');
      } catch {
        return null;
      }
    })();
  }
  return cachedModule;
}

/**
 * One-time setup: foreground handler, permissions, and the Android channel.
 * Safe to call on every mount. No-op when notifications are unavailable
 * (e.g. Android Expo Go, SDK 53+): the in-app timer is unaffected.
 */
export async function initNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    if (!handlerInstalled) {
      handlerInstalled = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(FLUX_TIMER_CHANNEL_ID, {
        name: 'Timer',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Notifications are best-effort.
  }
}

/**
 * Schedule the expiry banner for `fireInMs` from now. Resolves to the
 * notification id (for later cancellation) or null when unavailable.
 */
export async function scheduleExpiryNotification(fireInMs: number): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: EXPIRY_TITLE,
        body: EXPIRY_BODY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(fireInMs / 1000)),
        channelId: Platform.OS === 'android' ? FLUX_TIMER_CHANNEL_ID : undefined,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelExpiryNotification(id: string | null): Promise<void> {
  if (!id) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or gone — nothing to do.
  }
}
