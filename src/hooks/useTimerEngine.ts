import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { cancelExpiryNotification, scheduleExpiryNotification } from '@/lib/notifications';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';
export type HapticLevel = 'off' | 'light' | 'medium';

/** Default 25 minute focus session in ms. */
export const DEFAULT_DURATION_MS = 25 * 60 * 1000;

/** High-frequency ticker; exact time always derives from Date.now() deltas. */
const TICK_MS = 200;
/** Final stretch that gets a per-second haptic tick. */
const FINAL_COUNTDOWN_SECONDS = 10;

export const SESSIONS_STORE_KEY = 'flux:sessions';

/** Persisted while a session is running so a kill/relaunch can recover it. */
export const ACTIVE_SESSION_KEY = 'flux:active_session';

export interface ActiveSession {
  startTimestamp: number;
  durationMs: number;
  presetId: string;
}

function isValidActiveSession(value: unknown): value is ActiveSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.startTimestamp === 'number' &&
    Number.isFinite(v.startTimestamp) &&
    v.startTimestamp > 0 &&
    typeof v.durationMs === 'number' &&
    Number.isFinite(v.durationMs) &&
    v.durationMs > 0 &&
    typeof v.presetId === 'string' &&
    v.presetId.length > 0
  );
}

async function persistActiveSession(session: ActiveSession): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Persistence is best-effort.
  }
}

async function clearActiveSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Best effort.
  }
}

/**
 * Relaunch recovery: if a session was running when the process died and its
 * wall-clock expiry (`startTimestamp + durationMs`) has passed, log it
 * retroactively to `flux:sessions` and clear the marker. Otherwise leave the
 * marker alone. Never throws.
 */
export async function recoverActiveSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await clearActiveSession();
      return;
    }
    if (!isValidActiveSession(parsed)) {
      await clearActiveSession();
      return;
    }
    if (Date.now() > parsed.startTimestamp + parsed.durationMs) {
      const expiry = new Date(parsed.startTimestamp + parsed.durationMs);
      await saveSession({
        durationMinutes: Math.max(1, Math.round(parsed.durationMs / 60000)),
        presetId: parsed.presetId,
        completedAt: Number.isNaN(expiry.getTime()) ? new Date().toISOString() : expiry.toISOString(),
      });
      await clearActiveSession();
    }
  } catch {
    // Recovery is best-effort.
  }
}

export interface FocusSession {
  id: string;
  durationMinutes: number;
  presetId: string;
  completedAt: string;
}

/**
 * Append a completed session to AsyncStorage. Best-effort — never throws.
 * History (`src/app/(tabs)/history.tsx`) reads the same key.
 */
export async function saveSession(input: {
  durationMinutes: number;
  presetId: string;
  completedAt: string;
}): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const sessions: FocusSession[] = Array.isArray(parsed) ? (parsed as FocusSession[]) : [];
    const entry: FocusSession = {
      id: `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      ...input,
    };
    await AsyncStorage.setItem(SESSIONS_STORE_KEY, JSON.stringify([...sessions, entry]));
  } catch {
    // Persistence is best-effort.
  }
}

export interface UseTimerEngineOptions {
  defaultDurationMs?: number;
  presetId?: string;
  hapticLevel?: HapticLevel;
  onComplete?: (session: FocusSession) => void;
}

export interface UseTimerEngineReturn {
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  /** 0.0 at start → 1.0 at complete. */
  progress: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (newDurationMs?: number) => void;
}

function fireImpact(level: HapticLevel): void {
  if (level === 'off') return;
  const style =
    level === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  void Haptics.impactAsync(style).catch(() => undefined);
}

/**
 * Drift-corrected countdown engine.
 *
 * - `endAtRef` (a Date.now() timestamp) is the single source of truth while
 *   running; every tick recomputes `remaining = endAt - Date.now()`, so
 *   JS interval drift or background throttling can never skew the session.
 * - `AppState` listener snapshots remaining time when backgrounding and
 *   rebuilds `endAt` + forces an instant recalculation on foregrounding.
 * - Completion fires a Success notification haptic and persists the session.
 * - An OS-level expiry banner is scheduled on start/resume and withdrawn on
 *   pause/reset (or foreground completion) so background expiry still lands.
 * - `defaultDurationMs` preference changes apply immediately while idle;
 *   active sessions are never disturbed.
 * - Crash recovery: `flux:active_session` is persisted on start/resume and
 *   cleared on pause/reset/complete; a session that expired while killed is
 *   logged retroactively on next launch.
 */
export function useTimerEngine(options: UseTimerEngineOptions = {}): UseTimerEngineReturn {
  const { defaultDurationMs = DEFAULT_DURATION_MS, onComplete } = options;
  const presetId = options.presetId ?? 'sand';
  const hapticLevel = options.hapticLevel ?? 'medium';

  const initialDuration = useMemo(
    () =>
      typeof defaultDurationMs === 'number' &&
      Number.isFinite(defaultDurationMs) &&
      defaultDurationMs > 0
        ? Math.round(defaultDurationMs)
        : DEFAULT_DURATION_MS,
    // Fixed at mount; later preference changes sync via the idle effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [status, setStatus] = useState<TimerStatus>('idle');
  const [durationMs, setDurationMs] = useState(initialDuration);
  const [remainingMs, setRemainingMs] = useState(initialDuration);

  const statusRef = useRef<TimerStatus>('idle');
  const durationRef = useRef(initialDuration);
  const remainingRef = useRef(initialDuration);
  const endAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef(0);
  const lastSecondRef = useRef(-1);
  const appStateRef = useRef(AppState.currentState);

  // Latest options without destabilising the ticker callbacks.
  // Synced in effects (never during render) per react-hooks/refs.
  const optsRef = useRef({ presetId, hapticLevel, onComplete });
  useEffect(() => {
    optsRef.current = { presetId, hapticLevel, onComplete };
  }, [presetId, hapticLevel, onComplete]);

  // OS-level expiry banner. Replaced on every start/resume so at most one is
  // ever pending; it fires even if JS is suspended or the app is backgrounded.
  const notificationIdRef = useRef<string | null>(null);

  const scheduleExpiry = useCallback(() => {
    (async () => {
      const pending = notificationIdRef.current;
      notificationIdRef.current = null;
      await cancelExpiryNotification(pending);
      notificationIdRef.current = await scheduleExpiryNotification(remainingRef.current);
    })();
  }, []);

  const cancelExpiry = useCallback(() => {
    (async () => {
      const pending = notificationIdRef.current;
      notificationIdRef.current = null;
      await cancelExpiryNotification(pending);
    })();
  }, []);

  // Follow preference changes while idle so the dashboard reflects new
  // defaults immediately. Running/paused sessions are never disturbed.
  useEffect(() => {
    (async () => {
      await Promise.resolve();
      if (statusRef.current !== 'idle') return;
      const next = Math.round(defaultDurationMs);
      if (!Number.isFinite(next) || next <= 0 || next === durationRef.current) return;
      durationRef.current = next;
      remainingRef.current = next;
      setDurationMs(next);
      setRemainingMs(next);
    })();
  }, [defaultDurationMs]);

  const tick = useCallback(() => {
    if (statusRef.current !== 'running') return;
    const left = endAtRef.current - Date.now();

    if (left <= 0) {
      const runId = runIdRef.current;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      remainingRef.current = 0;
      statusRef.current = 'complete';
      setRemainingMs(0);
      setStatus('complete');

      // Foreground completion is already celebrated in-app — withdraw the OS
      // banner. If backgrounded, leave it so the OS delivers expiry.
      if (appStateRef.current === 'active') {
        cancelExpiry();
      } else {
        notificationIdRef.current = null;
      }

      const current = optsRef.current;
      if (current.hapticLevel !== 'off') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      }
      const session: FocusSession = {
        id: `session-${Date.now()}-${runId}`,
        durationMinutes: Math.max(1, Math.round(durationRef.current / 60000)),
        presetId: current.presetId,
        completedAt: new Date().toISOString(),
      };
      void saveSession({
        durationMinutes: session.durationMinutes,
        presetId: session.presetId,
        completedAt: session.completedAt,
      });
      void clearActiveSession();
      current.onComplete?.(session);
      return;
    }

    remainingRef.current = left;
    setRemainingMs(left);

    const whole = Math.ceil(left / 1000);
    if (whole !== lastSecondRef.current) {
      lastSecondRef.current = whole;
      if (whole <= FINAL_COUNTDOWN_SECONDS && whole > 0) {
        fireImpact(optsRef.current.hapticLevel);
      }
    }
  }, [cancelExpiry]);

  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    runIdRef.current += 1;
    if (statusRef.current === 'complete' || remainingRef.current <= 0) {
      remainingRef.current = durationRef.current;
      setRemainingMs(durationRef.current);
    }
    statusRef.current = 'running';
    setStatus('running');
    endAtRef.current = Date.now() + remainingRef.current;
    lastSecondRef.current = Math.ceil(remainingRef.current / 1000);
    intervalRef.current = setInterval(() => tickRef.current(), TICK_MS);
    tickRef.current();
    scheduleExpiry();
    void persistActiveSession({
      startTimestamp: Date.now(),
      durationMs: durationRef.current,
      presetId: optsRef.current.presetId,
    });
  }, [scheduleExpiry]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    remainingRef.current = Math.max(0, endAtRef.current - Date.now());
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    cancelExpiry();
    void clearActiveSession();
    statusRef.current = 'paused';
    setStatus('paused');
    setRemainingMs(remainingRef.current);
  }, [cancelExpiry]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    statusRef.current = 'running';
    setStatus('running');
    endAtRef.current = Date.now() + remainingRef.current;
    lastSecondRef.current = Math.ceil(remainingRef.current / 1000);
    intervalRef.current = setInterval(() => tickRef.current(), TICK_MS);
    tickRef.current();
    scheduleExpiry();
    void persistActiveSession({
      // Backdate so startTimestamp + durationMs still equals the wall-clock expiry.
      startTimestamp: Date.now() - (durationRef.current - remainingRef.current),
      durationMs: durationRef.current,
      presetId: optsRef.current.presetId,
    });
  }, [scheduleExpiry]);

  const reset = useCallback((newDurationMs?: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    cancelExpiry();
    void clearActiveSession();
    runIdRef.current += 1;
    if (
      typeof newDurationMs === 'number' &&
      Number.isFinite(newDurationMs) &&
      newDurationMs > 0
    ) {
      durationRef.current = Math.round(newDurationMs);
      setDurationMs(durationRef.current);
    }
    remainingRef.current = durationRef.current;
    lastSecondRef.current = -1;
    statusRef.current = 'idle';
    setRemainingMs(remainingRef.current);
    setStatus('idle');
  }, [cancelExpiry]);

  // Background handling: snapshot on leave, rebuild endAt + recalc instantly on return.
  useEffect(() => {
    appStateRef.current = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (statusRef.current !== 'running') return;
      if (next === 'background' || next === 'inactive') {
        remainingRef.current = Math.max(0, endAtRef.current - Date.now());
        setRemainingMs(remainingRef.current);
      } else if (next === 'active' && (prev === 'background' || prev === 'inactive')) {
        endAtRef.current = Date.now() + remainingRef.current;
        tickRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  // Relaunch recovery: a session that expired while the process was dead
  // is logged retroactively exactly once.
  useEffect(() => {
    void recoverActiveSession();
  }, []);

  // Stop the ticker and withdraw any pending banner on unmount.
  useEffect(() => {
    const ref = intervalRef;
    return () => {
      if (ref.current) clearInterval(ref.current);
      cancelExpiry();
    };
  }, [cancelExpiry]);

  const progress = useMemo(() => {
    if (durationMs <= 0) return 0;
    const p = 1 - remainingMs / durationMs;
    return Math.min(1, Math.max(0, p));
  }, [remainingMs, durationMs]);

  return { status, durationMs, remainingMs, progress, start, pause, resume, reset };
}
