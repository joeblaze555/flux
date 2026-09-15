import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FluxCanvas } from '@/components/FluxCanvas';
import { SESSIONS_STORE_KEY, useTimerEngine, type HapticLevel } from '@/hooks/useTimerEngine';
import { initNotifications } from '@/lib/notifications';

import { ART_PRESETS, PRESET_KEY } from './gallery';
import { DEFAULT_PREFS, loadPrefs, type FluxPrefs } from './settings';

const BG = '#0B0F19';
const SURFACE = 'rgba(255, 255, 255, 0.06)';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const TEXT = '#F3F4F6';
const MUTED = '#9CA3AF';
const ACCENT = '#8B5CF6';
const CALM = '#34D399';

const CANVAS_SIZE = 300;
/** Wake-lock tag held only while the timer is running. */
const WAKE_LOCK_TAG = 'flux-timer';
/** Breathing room in stillness before an auto-start session begins. */
const AUTO_START_DELAY_MS = 4000;

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pressFeedback(level: HapticLevel): void {
  if (level === 'off') return;
  try {
    void Haptics.selectionAsync().catch(() => undefined);
  } catch {
    // Haptics best-effort.
  }
}

export default function TimerScreen() {
  const insets = useSafeAreaInsets();
  const [presetId, setPresetId] = useState('sand');
  const [prefs, setPrefs] = useState<FluxPrefs>(DEFAULT_PREFS);
  const [todayMinutes, setTodayMinutes] = useState(0);

  const loadDisplayPrefs = useCallback(async () => {
    try {
      const [savedPreset, savedPrefs] = await Promise.all([
        AsyncStorage.getItem(PRESET_KEY),
        loadPrefs(),
      ]);
      if (savedPreset) setPresetId(savedPreset);
      setPrefs(savedPrefs);
    } catch {
      // Best effort — defaults remain.
    }
  }, []);

  // Today's completed focus minutes (local calendar day) for the goal widget.
  const loadTodayMinutes = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSIONS_STORE_KEY);
      if (!raw) {
        setTodayMinutes(0);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setTodayMinutes(0);
        return;
      }
      const now = new Date();
      let sum = 0;
      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue;
        const rec = entry as { durationMinutes?: unknown; completedAt?: unknown };
        if (typeof rec.durationMinutes !== 'number' || typeof rec.completedAt !== 'string') continue;
        const d = new Date(rec.completedAt);
        if (Number.isNaN(d.getTime())) continue;
        if (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        ) {
          sum += rec.durationMinutes;
        }
      }
      setTodayMinutes(Math.max(0, Math.round(sum)));
    } catch {
      setTodayMinutes(0);
    }
  }, []);

  // Refresh preset + preferences + today's total whenever returning (gallery, settings, history).
  useFocusEffect(
    useCallback(() => {
      void loadDisplayPrefs();
      void loadTodayMinutes();
    }, [loadDisplayPrefs, loadTodayMinutes]),
  );

  // Notification handler, permissions, and Android channel — once.
  useEffect(() => {
    void initNotifications();
  }, []);

  const { status, remainingMs, progress, start, pause, resume, reset } = useTimerEngine({
    presetId,
    defaultDurationMs: prefs.defaultDurationMs,
    hapticLevel: prefs.hapticLevel,
  });

  // Auto-start: after settling into stillness, begin the next session.
  // Cancelled if the user acts first (status change clears the timeout).
  useEffect(() => {
    if (status !== 'complete' || !prefs.autoStart) return;
    const timer = setTimeout(() => {
      reset();
      start();
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, prefs.autoStart, reset, start]);

  // Screen wake lock: held only while focusing; released on pause/idle/complete.
  useEffect(() => {
    if (status === 'running') {
      void activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => undefined);
    } else {
      void deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => undefined);
    }
    return () => {
      void deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => undefined);
    };
  }, [status]);

  const presetTitle = ART_PRESETS.find((preset) => preset.id === presetId)?.title ?? 'Sifting Sand';

  const goalMinutes = prefs.dailyGoalMinutes;
  const goalPct =
    goalMinutes > 0 ? Math.min(100, Math.round((todayMinutes / goalMinutes) * 100)) : 0;
  const goalMet = goalMinutes > 0 && todayMinutes >= goalMinutes;

  const statusLabel =
    status === 'running'
      ? 'Focusing'
      : status === 'paused'
        ? 'Paused'
        : status === 'complete'
          ? 'Settled in stillness'
          : 'Ready to begin';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.brand}>
          <LinearGradient
            colors={['#06B6D4', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandTile}>
            <Ionicons name="timer-outline" size={20} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.brandName}>Flux</Text>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, status === 'running' && styles.statusDotLive]} />
          <Text style={styles.statusPillText}>{status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.canvasWrap}>
        <View style={styles.canvasFrame}>
          <FluxCanvas progress={progress} status={status} size={CANVAS_SIZE} presetId={presetId} />
        </View>
        <Text
          style={styles.readout}
          accessibilityLabel={`Time remaining ${formatMs(remainingMs)}`}>
          {formatMs(remainingMs)}
        </Text>
        <Text style={styles.presetCaption}>{presetTitle}</Text>
      </View>

      <View style={styles.goalCard} accessibilityLabel={`Today ${todayMinutes} of ${goalMinutes} minutes`}>
        <View style={styles.goalMeta}>
          <Text style={styles.goalLabel}>Today</Text>
          <Text style={styles.goalValue}>
            {goalMet ? `${todayMinutes}m · goal met` : `${todayMinutes} / ${goalMinutes} min`}
          </Text>
        </View>
        <View style={styles.goalTrack}>
          <View
            style={[styles.goalFill, { width: `${goalPct}%` }, goalMet && styles.goalFillMet]}
          />
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 100 }]}>
        {status === 'running' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pause timer"
            onPress={() => {
              pressFeedback(prefs.hapticLevel);
              pause();
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Ionicons name="pause" size={22} color="#fff" />
            <Text style={styles.primaryText}>Pause</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start timer"
            onPress={() => {
              pressFeedback(prefs.hapticLevel);
              if (status === 'paused') resume();
              else start();
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Ionicons name="play" size={22} color="#fff" />
            <Text style={styles.primaryText}>
              {status === 'paused' ? 'Resume' : status === 'complete' ? 'Begin again' : 'Start'}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset timer"
          onPress={() => {
            pressFeedback(prefs.hapticLevel);
            reset();
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Ionicons name="refresh-outline" size={20} color={TEXT} />
          <Text style={styles.secondaryText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MUTED,
  },
  statusDotLive: {
    backgroundColor: CALM,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: TEXT,
  },
  canvasWrap: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  canvasFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  readout: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  presetCaption: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
  },
  goalCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: MUTED,
  },
  goalValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TEXT,
    fontVariant: ['tabular-nums'],
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  goalFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  goalFillMet: {
    backgroundColor: CALM,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 34,
    paddingVertical: 15,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 15,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
  },
  pressed: {
    opacity: 0.7,
  },
});
