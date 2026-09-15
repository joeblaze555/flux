import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HapticLevel } from '@/hooks/useTimerEngine';

const BG = '#0B0F19';
const SURFACE = 'rgba(255, 255, 255, 0.06)';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const TEXT = '#F3F4F6';
const MUTED = '#9CA3AF';
const ACCENT = '#8B5CF6';

export const PREFS_KEY = 'flux:preferences';

export interface FluxPrefs {
  defaultDurationMs: number;
  hapticLevel: HapticLevel;
  autoStart: boolean;
  dailyGoalMinutes: number;
}

export const DEFAULT_PREFS: FluxPrefs = {
  defaultDurationMs: 25 * 60 * 1000,
  hapticLevel: 'medium',
  autoStart: false,
  dailyGoalMinutes: 60,
};

const DURATION_OPTIONS = [
  { minutes: 5, ms: 5 * 60 * 1000 },
  { minutes: 15, ms: 15 * 60 * 1000 },
  { minutes: 25, ms: 25 * 60 * 1000 },
] as const;

const HAPTIC_OPTIONS: readonly HapticLevel[] = ['off', 'light', 'medium'];

const GOAL_OPTIONS = [30, 60, 90, 120] as const;

/** App version from app.json — display only, no network involved. */
const APP_VERSION: string =
  typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version.length > 0
    ? Constants.expoConfig.version
    : '1.0.0';

/**
 * Load preferences with a fallback for the legacy `{ defaultDuration }`
 * minutes-based shape.
 */
export async function loadPrefs(): Promise<FluxPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<FluxPrefs> & { defaultDuration?: unknown };
    const ms =
      typeof parsed.defaultDurationMs === 'number' && parsed.defaultDurationMs > 0
        ? Math.round(parsed.defaultDurationMs)
        : typeof parsed.defaultDuration === 'number' && parsed.defaultDuration > 0
          ? Math.round(parsed.defaultDuration * 60000)
          : DEFAULT_PREFS.defaultDurationMs;
    const hapticLevel: HapticLevel =
      parsed.hapticLevel === 'off' ||
      parsed.hapticLevel === 'light' ||
      parsed.hapticLevel === 'medium'
        ? parsed.hapticLevel
        : DEFAULT_PREFS.hapticLevel;
    const dailyGoalMinutes =
      typeof parsed.dailyGoalMinutes === 'number' &&
      Number.isFinite(parsed.dailyGoalMinutes) &&
      parsed.dailyGoalMinutes > 0
        ? Math.round(parsed.dailyGoalMinutes)
        : DEFAULT_PREFS.dailyGoalMinutes;
    return { defaultDurationMs: ms, hapticLevel, autoStart: parsed.autoStart === true, dailyGoalMinutes };
  } catch {
    return DEFAULT_PREFS;
  }
}

async function fireForLevel(level: HapticLevel) {
  try {
    if (level === 'light') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (level === 'medium') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Best effort.
  }
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<FluxPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    (async () => {
      setPrefs(await loadPrefs());
    })();
  }, []);

  const persist = useCallback(async (next: FluxPrefs) => {
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Best effort.
    }
  }, []);

  const hapticLabel = (o: HapticLevel) => (o === 'off' ? 'Off' : o === 'light' ? 'Light' : 'Medium');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Preferences</Text>
        <Text style={styles.subtitle}>Tune Flux timing, touch feedback, and flow</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default session duration</Text>
          <View style={styles.chipRow}>
            {DURATION_OPTIONS.map(({ minutes, ms }) => {
              const active = prefs.defaultDurationMs === ms;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityLabel={`Default ${minutes} minutes`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void fireForLevel(prefs.hapticLevel);
                    void persist({ ...prefs, defaultDurationMs: ms });
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{minutes}m</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Haptic intensity</Text>
          <View style={styles.chipRow}>
            {HAPTIC_OPTIONS.map((o) => {
              const active = prefs.hapticLevel === o;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  accessibilityLabel={`Haptics ${o}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void fireForLevel(o === 'off' ? 'light' : o);
                    void persist({ ...prefs, hapticLevel: o });
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {hapticLabel(o)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily focus goal</Text>
          <View style={styles.chipRow}>
            {GOAL_OPTIONS.map((minutes) => {
              const active = prefs.dailyGoalMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityLabel={`Daily goal ${minutes} minutes`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void fireForLevel(prefs.hapticLevel);
                    void persist({ ...prefs, dailyGoalMinutes: minutes });
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{minutes}m</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.sectionTitle}>Auto-start next session</Text>
              <Text style={styles.toggleSub}>Begin the next countdown without tapping Start</Text>
            </View>
            <Switch
              value={prefs.autoStart}
              accessibilityLabel="Auto-start next session"
              onValueChange={(v) => {
                void fireForLevel(prefs.hapticLevel);
                void persist({ ...prefs, autoStart: v });
              }}
              trackColor={{ false: MUTED, true: ACCENT }}
            />
          </View>
        </View>

        <View style={styles.about}>
          <Ionicons name="leaf-outline" size={20} color={MUTED} />
          <Text style={styles.aboutText}>
            Flux ends in stillness — visuals settle, haptics confirm softly. No alarms.
          </Text>
        </View>

        <Text style={styles.version} accessibilityLabel={`Flux version ${APP_VERSION}`}>
          Flux v{APP_VERSION} · all data stays on this device
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 20,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: TEXT,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    marginTop: 4,
  },
  section: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '800',
    color: MUTED,
  },
  chipTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  toggleSub: {
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },
  about: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  aboutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },
  version: {
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    textAlign: 'center',
    opacity: 0.8,
  },
  pressed: {
    opacity: 0.7,
  },
});
