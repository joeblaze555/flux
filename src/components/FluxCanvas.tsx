import { Canvas, Circle, Group, Path, Points, Rect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { TimerStatus } from '@/hooks/useTimerEngine';

interface FluxCanvasProps {
  /** 0.0 at session start → 1.0 at completion. */
  progress: number;
  status: TimerStatus;
  size?: number;
  presetId?: string;
}

const PARTICLE_COUNT = 100;
const SETTLED_MAX = 44;

interface Palette {
  grain: string;
  grainDeep: string;
  pile: string;
  barrier: string;
  ring: string;
}

const PALETTES: Record<string, Palette> = {
  sand: {
    grain: '#FBBF24',
    grainDeep: '#F59E0B',
    pile: '#F59E0B',
    barrier: '#8B5CF6',
    ring: '#FBBF24',
  },
  orbs: {
    grain: '#22D3EE',
    grainDeep: '#818CF8',
    pile: '#A78BFA',
    barrier: '#EC4899',
    ring: '#22D3EE',
  },
  fluid: {
    grain: '#2DD4BF',
    grainDeep: '#06B6D4',
    pile: '#06B6D4',
    barrier: '#818CF8',
    ring: '#2DD4BF',
  },
};

const FALLBACK_PALETTE: Palette = {
  grain: '#FBBF24',
  grainDeep: '#F59E0B',
  pile: '#F59E0B',
  barrier: '#8B5CF6',
  ring: '#FBBF24',
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const frac = (v: number) => v - Math.floor(v);

/** Shared UI-thread animation state passed to each preset visual. */
interface VisualState {
  S: number;
  p: number;
  palette: Palette;
  time: SharedValue<number>;
  progressSV: SharedValue<number>;
  settle: SharedValue<number>;
}

/** SVG-style arc path for the progress ring (sweep from top). */
function arcPath(cx: number, cy: number, r: number, p: number): string {
  const start = -Math.PI / 2;
  const end = start + p * Math.PI * 2;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
}

/* ------------------------------------------------------------------ */
/* sand — sifting grains, barriers, accumulation, mandala equilibrium  */
/* ------------------------------------------------------------------ */

interface Seed {
  x: number;
  y: number;
  speed: number;
  phase: number;
  amp: number;
}

interface Obstacle {
  x: number;
  y: number;
  r: number;
}

function SandVisual({ S, p, palette, time, progressSV, settle }: VisualState) {
  // Deterministic seeds — stable across renders, no Math.random() churn.
  const seeds = useMemo<Seed[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        x: frac(i * 0.618033988749895),
        y: frac(i * 0.381966011250105 + 0.25),
        speed: 0.55 + frac(i * 0.177215669) * 0.9,
        phase: i * 0.77,
        amp: 5 + (i % 5) * 2.5,
      })),
    [],
  );

  const obstacles = useMemo<Obstacle[]>(
    () => [
      { x: 0.3 * S, y: 0.3 * S, r: 0.085 * S },
      { x: 0.68 * S, y: 0.26 * S, r: 0.07 * S },
      { x: 0.5 * S, y: 0.44 * S, r: 0.1 * S },
      { x: 0.24 * S, y: 0.55 * S, r: 0.06 * S },
    ],
    [S],
  );

  const center = useMemo(() => vec(S / 2, S * 0.5), [S]);

  // Falling grains: drift down with progress, sway, deflect around barriers.
  const { fall, deep } = useMemo(() => {
    const travel = p * 1.2;
    const fallPts: { x: number; y: number }[] = [];
    const deepPts: { x: number; y: number }[] = [];
    seeds.forEach((seed, i) => {
      const y01 = frac(seed.y + travel * seed.speed);
      let x = seed.x * S + Math.sin(seed.phase + p * Math.PI * 3) * seed.amp * (1 - p * 0.4);
      const y = 10 + y01 * (S - 48);
      for (const o of obstacles) {
        const dx = x - o.x;
        const dy = y - o.y;
        const rr = o.r + 9;
        if (Math.abs(dy) < rr && Math.abs(dx) < rr) {
          x += (dx >= 0 ? 1 : -1) * (rr - Math.abs(dx)) * 0.7;
        }
      }
      const pt = vec(Math.min(S - 4, Math.max(4, x)), y);
      fallPts.push(pt);
      if (i % 4 === 0) deepPts.push(pt);
    });
    return { fall: fallPts, deep: deepPts };
  }, [seeds, obstacles, p, S]);

  // Accumulation pile at the base — grows proportionally with progress.
  const settled = useMemo(() => {
    const count = Math.floor(p * SETTLED_MAX);
    const cols = 22;
    return Array.from({ length: count }, (_, k) => {
      const row = Math.floor(k / cols);
      const col = k % cols;
      const jitter = (seeds[k]?.x ?? 0.5) * 6 - 3;
      return vec((col + 0.5) * (S / cols) + jitter, S - 12 - row * 6.5);
    });
  }, [p, S, seeds]);

  // Frozen radial mandala for equilibrium (P = 1).
  const mandala = useMemo(() => {
    const cx = S / 2;
    const cy = S * 0.52;
    const pts: { x: number; y: number }[] = [];
    const rings = 5;
    const perRing = PARTICLE_COUNT / rings;
    for (let ring = 0; ring < rings; ring += 1) {
      const radius = S * (0.1 + ring * 0.055);
      for (let j = 0; j < perRing; j += 1) {
        const angle = (j / perRing) * Math.PI * 2 + ring * 0.31;
        pts.push(vec(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
      }
    }
    return pts;
  }, [S]);

  const sway = useDerivedValue(() => [
    { translateX: Math.sin(time.value * 0.9) * 5 },
    { translateY: Math.cos(time.value * 0.63) * 4 },
    { rotate: progressSV.value * 0.3 + Math.sin(time.value * 0.22) * 0.035 },
  ]);

  const fallOpacity = useDerivedValue(
    () => (1 - settle.value) * (0.35 + 0.65 * progressSV.value),
  );
  const mandalaOpacity = useDerivedValue(() => settle.value);
  const haloPulse = useDerivedValue(() => 0.16 + 0.09 * (0.5 + 0.5 * Math.sin(time.value * 1.4)));

  return (
    <>
      {/* Translucent glowing barriers (breathing halos on the UI thread). */}
      <Group opacity={haloPulse}>
        {obstacles.map((o, i) => (
          <Circle key={`halo-${i}`} cx={o.x} cy={o.y} r={o.r * 1.8} color={palette.barrier} />
        ))}
      </Group>
      {obstacles.map((o, i) => (
        <Circle
          key={`barrier-${i}`}
          cx={o.x}
          cy={o.y}
          r={o.r}
          color="rgba(255,255,255,0.10)"
          style="stroke"
          strokeWidth={2}
        />
      ))}

      {/* Falling sand — positions follow progress, sway/rotation run at 60fps. */}
      <Group origin={center} transform={sway} opacity={fallOpacity}>
        <Points points={fall} mode="points" color={palette.grain} strokeWidth={4} strokeCap="round" />
        <Points
          points={deep}
          mode="points"
          color={palette.grainDeep}
          strokeWidth={6.5}
          strokeCap="round"
        />
      </Group>

      {/* Accumulation pile at the base. */}
      {settled.length > 0 && (
        <Group opacity={Math.min(1, 0.25 + p * 0.9)}>
          <Points
            points={settled}
            mode="points"
            color={palette.pile}
            strokeWidth={6}
            strokeCap="round"
          />
          <Rect x={12} y={S - 7} width={S - 24} height={3} color={palette.pile} opacity={0.5} />
        </Group>
      )}

      {/* Tranquil equilibrium mandala — fades in over 1.5s, perfectly frozen. */}
      <Group opacity={mandalaOpacity}>
        <Points points={mandala} mode="points" color="#34D399" strokeWidth={4} strokeCap="round" />
        <Circle
          cx={S / 2}
          cy={S * 0.52}
          r={S * 0.32}
          color="rgba(52,211,153,0.5)"
          style="stroke"
          strokeWidth={1.5}
        />
        <Circle
          cx={S / 2}
          cy={S * 0.52}
          r={S * 0.1}
          color="rgba(52,211,153,0.7)"
          style="stroke"
          strokeWidth={1.5}
        />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* orbs — counter-rotating kinetic geometry, kaleidoscope equilibrium  */
/* ------------------------------------------------------------------ */

interface RingConfig {
  fraction: number;
  dir: 1 | -1;
  speed: number;
}

const ORB_RINGS: readonly RingConfig[] = [
  { fraction: 0.12, dir: 1, speed: 0.5 },
  { fraction: 0.17, dir: -1, speed: 0.38 },
  { fraction: 0.22, dir: 1, speed: 0.62 },
  { fraction: 0.27, dir: -1, speed: 0.46 },
  { fraction: 0.32, dir: 1, speed: 0.3 },
];

const SATELLITE_ANGLES = [0, 2.094, 4.189];

function OrbRing({
  cx,
  cy,
  radius,
  dir,
  speed,
  index,
  color,
  strokeWidth,
  time,
  progressSV,
  settle,
}: {
  cx: number;
  cy: number;
  radius: number;
  dir: 1 | -1;
  speed: number;
  index: number;
  color: string;
  strokeWidth: number;
  time: SharedValue<number>;
  progressSV: SharedValue<number>;
  settle: SharedValue<number>;
}) {
  const origin = useMemo(() => vec(cx, cy), [cx, cy]);

  // Counter-rotation accelerates with progress; settle blends each ring into
  // its 12-fold kaleidoscope slot (frozen sacred geometry at s = 1).
  const rotation = useDerivedValue(() => {
    const spin = dir * time.value * speed * (0.25 + progressSV.value * 1.6);
    const snap = index * (Math.PI / 6);
    const s = settle.value;
    return [{ rotate: spin * (1 - s) + snap * s }];
  });

  return (
    <Group origin={origin} transform={rotation}>
      <Circle cx={cx} cy={cy} r={radius} color={color} style="stroke" strokeWidth={strokeWidth} />
      {SATELLITE_ANGLES.map((a, k) => (
        <Circle
          key={k}
          cx={cx + Math.cos(a) * radius}
          cy={cy + Math.sin(a) * radius}
          r={strokeWidth * 1.5}
          color={color}
        />
      ))}
    </Group>
  );
}

function OrbsVisual({ S, p, palette, time, progressSV, settle }: VisualState) {
  const cx = S / 2;
  const cy = S * 0.5;
  const glow = useDerivedValue(() => 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(time.value * 1.1)));

  return (
    <>
      <Group opacity={glow}>
        <Circle cx={cx} cy={cy} r={S * 0.38} color={palette.barrier} />
      </Group>
      {ORB_RINGS.map((cfg, i) => (
        <OrbRing
          key={i}
          cx={cx}
          cy={cy}
          radius={S * cfg.fraction}
          dir={cfg.dir}
          speed={cfg.speed}
          index={i}
          color={i % 2 === 0 ? palette.grain : palette.grainDeep}
          strokeWidth={2 + p * 2.5}
          time={time}
          progressSV={progressSV}
          settle={settle}
        />
      ))}
      <Circle cx={cx} cy={cy} r={5 + p * 3} color={palette.ring} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* fluid — morphing wave fields, mirror-still equilibrium              */
/* ------------------------------------------------------------------ */

function makeWavePath(S: number, baseY: number, amp: number, phase: number): SkPath {
  const path = Skia.Path.Make();
  const segments = 48;
  const from = -10;
  const to = S + 10;
  path.moveTo(from, S + 10);
  path.lineTo(from, baseY + Math.sin(phase) * amp);
  for (let s = 1; s <= segments; s += 1) {
    const x = from + ((to - from) * s) / segments;
    const t = (x / (S / 1.5)) * Math.PI * 2 + phase;
    const y = baseY + Math.sin(t) * amp + Math.sin(t * 2 + phase * 1.7) * amp * 0.35;
    path.lineTo(x, y);
  }
  path.lineTo(to, S + 10);
  path.close();
  return path;
}

function FluidVisual({ S, p, palette, time, settle }: VisualState) {
  const layers = useMemo(
    () =>
      [0, 1, 2].map((L) => ({
        path: makeWavePath(
          S,
          S * (0.38 + 0.28 * p) + L * S * 0.085,
          S * 0.045 * (1 - 0.45 * p),
          p * Math.PI * 4 + L * 1.3,
        ),
        color: [palette.grain, palette.grainDeep, palette.pile][L] ?? palette.grain,
        opacity: [0.4, 0.3, 0.28][L] ?? 0.3,
      })),
    [S, p, palette],
  );

  const bob = useDerivedValue(() => [{ translateY: Math.sin(time.value * 0.7) * 5 }]);
  const waveFade = useDerivedValue(() => 1 - settle.value * 0.97);
  const mirrorFade = useDerivedValue(() => settle.value);

  const mirrorY = S * 0.55;

  return (
    <>
      {/* Morphing waves — shape follows progress, bob runs at 60fps. */}
      <Group transform={bob} opacity={waveFade}>
        {layers.map((layer, i) => (
          <Path key={i} path={layer.path} color={layer.color} opacity={layer.opacity} />
        ))}
      </Group>

      {/* Tranquil mirror surface — crossfades in over 1.5s, perfectly flat. */}
      <Group opacity={mirrorFade}>
        <Circle cx={S / 2} cy={mirrorY} r={S * 0.2} color={palette.grain} opacity={0.12} />
        <Rect x={16} y={mirrorY - 1} width={S - 32} height={2.5} color="#E6FFFA" opacity={0.9} />
        <Rect x={S * 0.28} y={mirrorY + 9} width={S * 0.44} height={1.5} color="#99F6E4" opacity={0.5} />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* root canvas                                                         */
/* ------------------------------------------------------------------ */

/**
 * Kinetic art canvas (Skia v2 + Reanimated, Expo SDK 57).
 *
 * - Particle *positions* recompute in JS only when `progress` ticks (low
 *   frequency React renders); continuous 60fps motion runs on the UI thread
 *   via Reanimated shared values consumed directly by Skia nodes.
 * - `presetId` switches both palette AND behavior: sand (grains), orbs
 *   (counter-rotating geometry), fluid (morphing waves).
 * - At P = 1 each preset settles over 1.5s into its own stillness:
 *   mandala, kaleidoscope, or mirror.
 */
export function FluxCanvas({ progress, status, size = 300, presetId = 'sand' }: FluxCanvasProps) {
  const S = size;
  const p = clamp01(progress);
  const palette = PALETTES[presetId] ?? FALLBACK_PALETTE;

  const isSettled = status === 'complete' || p >= 1;

  // 60fps UI-thread clock (seconds since mount).
  const time = useSharedValue(0);
  useFrameCallback((frame) => {
    time.value = frame.timeSinceFirstFrame / 1000;
  });

  const progressSV = useSharedValue(p);
  const settle = useSharedValue(0);

  useEffect(() => {
    progressSV.value = p;
  }, [p, progressSV]);

  useEffect(() => {
    settle.value = isSettled
      ? withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) })
      : 0;
  }, [isSettled, settle]);

  const visual: VisualState = { S, p, palette, time, progressSV, settle };

  const ringR = S / 2 - 10;
  const arc = useMemo(
    () => (p > 0 && p < 1 ? arcPath(S / 2, S / 2, ringR, p) : ''),
    [p, S, ringR],
  );

  return (
    <Canvas style={{ width: S, height: S }} accessibilityLabel="Kinetic timer canvas">
      <Rect x={0} y={0} width={S} height={S} color="#0B0F19" />
      <Circle cx={S / 2} cy={S / 2 + 10} r={S * 0.42} color="rgba(139,92,246,0.10)" />

      {presetId === 'orbs' ? (
        <OrbsVisual {...visual} />
      ) : presetId === 'fluid' ? (
        <FluidVisual {...visual} />
      ) : (
        <SandVisual {...visual} />
      )}

      {/* Progress ring. */}
      <Circle
        cx={S / 2}
        cy={S / 2}
        r={ringR}
        color="rgba(255,255,255,0.12)"
        style="stroke"
        strokeWidth={3}
      />
      {arc !== '' && <Path path={arc} color={palette.ring} style="stroke" strokeWidth={3} />}
      {p >= 1 && (
        <Circle
          cx={S / 2}
          cy={S / 2}
          r={ringR}
          color={palette.ring}
          style="stroke"
          strokeWidth={3}
        />
      )}
    </Canvas>
  );
}
