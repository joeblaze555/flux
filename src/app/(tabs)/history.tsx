import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BG = '#0B0F19';
const SURFACE = 'rgba(255, 255, 255, 0.06)';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const TEXT = '#F3F4F6';
const MUTED = '#9CA3AF';
const ACCENT = '#8B5CF6';
const CALM = '#34D399';
const DANGER = '#F87171';

export const SESSIONS_KEY = 'flux:sessions';

export interface FocusSession {
  id: string;
  durationMinutes: number;
  presetId: string;
  completedAt: string;
}

interface SessionGroup {
  label: string;
  data: FocusSession[];
}

interface PresetSlice {
  id: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

const PRESET_META = [
  { id: 'sand', label: 'Sand', color: '#F59E0B' },
  { id: 'orbs', label: 'Orbs', color: '#06B6D4' },
  { id: 'fluid', label: 'Fluid', color: '#34D399' },
] as const;

function isValidSession(value: unknown): value is FocusSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.durationMinutes === 'number' &&
    Number.isFinite(v.durationMinutes) &&
    typeof v.presetId === 'string' &&
    typeof v.completedAt === 'string' &&
    !Number.isNaN(new Date(v.completedAt).getTime())
  );
}

function parseSessions(raw: string | null): FocusSession[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isValidSession);
  } catch {
    return [];
  }
}

function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayKeyFromISO(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dayKeyLocal(d);
}

/**
 * Consecutive days with >= 1 session, ending today or yesterday.
 * A missing today does not break continuity — counting starts at yesterday.
 */
export function calculateStreak(sessions: FocusSession[], now: Date = new Date()): number {
  if (sessions.length === 0) return 0;
  const days = new Set<string>();
  for (const s of sessions) {
    const k = dayKeyFromISO(s.completedAt);
    if (k) days.add(k);
  }
  if (days.size === 0) return 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayKeyLocal(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKeyLocal(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKeyLocal(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 0 -> "0m", 45 -> "45m", 120 -> "2h", 765 -> "12h 45m". */
export function formatTotalTime(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatRowTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function groupSessionsByDate(sessions: FocusSession[], now: Date = new Date()): SessionGroup[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const buckets = new Map<string, FocusSession[]>();
  const order: string[] = [];
  for (const s of sorted) {
    const d = new Date(s.completedAt);
    const key = dayKeyLocal(d);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(s);
    } else {
      buckets.set(key, [s]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const data = buckets.get(key) ?? [];
    const sample = new Date(data[0]?.completedAt ?? key);
    const start = new Date(sample);
    start.setHours(0, 0, 0, 0);
    let label: string;
    if (start.getTime() === today.getTime()) label = 'Today';
    else if (start.getTime() === yesterday.getTime()) label = 'Yesterday';
    else {
      try {
        label = sample.toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
      } catch {
        label = key;
      }
    }
    return { label, data };
  });
}

function StatCard({
  icon,
  value,
  caption,
  label,
}: {
  icon: 'flame-outline' | 'time-outline' | 'checkmark-circle-outline';
  value: string;
  caption: string;
  label: string;
}) {
  return (
    <View style={styles.stat} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={ACCENT} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

function SessionRow({ session }: { session: FocusSession }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name="timer-outline" size={20} color={ACCENT} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {session.durationMinutes} min · {session.presetId}
        </Text>
        <Text style={styles.rowSub}>{formatRowTime(session.completedAt)}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={20} color={CALM} />
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<FocusSession[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSIONS_KEY);
      setSessions(parseSessions(raw));
    } catch {
      // Best effort — empty state remains.
    }
  }, []);

  // Reload every time the tab regains focus so fresh completions appear.
  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  const sessionCount = sessions.length;
  const totalMinutes = useMemo(
    () => sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    [sessions],
  );
  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const totalLabel = useMemo(() => formatTotalTime(totalMinutes), [totalMinutes]);

  const breakdown: PresetSlice[] = useMemo(() => {
    if (sessionCount === 0) {
      return PRESET_META.map((m) => ({ ...m, count: 0, pct: 0 }));
    }
    return PRESET_META.map((m) => {
      const count = sessions.filter((s) => s.presetId === m.id).length;
      return { ...m, count, pct: Math.round((count / sessionCount) * 100) };
    });
  }, [sessions, sessionCount]);

  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const handleCopySummary = useCallback(() => {
    if (sessions.length === 0) return;
    const summary =
      `Flux focus summary: ${sessionCount} session${sessionCount === 1 ? '' : 's'}` +
      ` · ${totalLabel} total · ${streak}-day streak`;
    void (async () => {
      try {
        await Clipboard.setStringAsync(summary);
        Alert.alert('Copied', 'Your focus summary is on the clipboard.');
      } catch {
        Alert.alert('Copy failed', 'Could not reach the clipboard. Try again.');
      }
    })();
  }, [sessions.length, sessionCount, totalLabel, streak]);

  const handleClear = useCallback(() => {    if (sessions.length === 0) return;
    Alert.alert(
      'Clear history?',
      `This permanently deletes ${sessions.length} completed session${sessions.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await AsyncStorage.removeItem(SESSIONS_KEY);
              } catch {
                // Best effort.
              } finally {
                setSessions([]);
              }
            })();
          },
        },
      ],
    );
  }, [sessions.length]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Sessions</Text>
        <Text style={styles.subtitle}>Streaks, totals, and your session log</Text>

        <View style={styles.statsRow}>
          <StatCard
            icon="flame-outline"
            value={String(streak)}
            caption="day streak"
            label={`Current streak ${streak} days`}
          />
          <StatCard
            icon="time-outline"
            value={totalLabel}
            caption="total focus"
            label={`Total focus time ${totalLabel}`}
          />
          <StatCard
            icon="checkmark-circle-outline"
            value={String(sessionCount)}
            caption="sessions"
            label={`Total sessions ${sessionCount}`}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preset mix</Text>
          {breakdown.map((slice) => (
            <View key={slice.id} style={styles.barRow}>
              <View style={styles.barMeta}>
                <View style={styles.barLabel}>
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  <Text style={styles.barName}>{slice.label}</Text>
                </View>
                <Text style={styles.barPct}>{slice.pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${slice.pct}%`, backgroundColor: slice.color }]} />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.logHeader}>
          <Text style={styles.cardTitle}>Session log</Text>
          {sessionCount > 0 && (
            <View style={styles.logActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy focus summary"
                onPress={handleCopySummary}
                style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
                <Text style={styles.copyText}>Copy summary</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear history"
                onPress={handleClear}
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
          )}
        </View>

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.iconTile}>
              <Ionicons name="time-outline" size={30} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySub}>
              Finish a timer session and it will appear here with duration, date, and art preset.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.groupList}>
                {group.data.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </View>
            </View>
          ))
        )}
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
    gap: 16,
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT,
    fontVariant: ['tabular-nums'],
  },
  statCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  card: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT,
  },
  barRow: {
    gap: 8,
  },
  barMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  barName: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    textTransform: 'capitalize',
  },
  barPct: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copy: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
  },
  clear: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    backgroundColor: 'rgba(248, 113, 113, 0.10)',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
    color: DANGER,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: MUTED,
  },
  groupList: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT,
    textTransform: 'capitalize',
  },
  rowSub: {
    fontSize: 13,
    color: MUTED,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 12,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT,
  },
  emptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
