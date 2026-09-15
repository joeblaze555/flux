import { useEffect } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import type { OnboardingSlideData } from '@/constants/onboarding';

/**
 * Props for a single onboarding page.
 * `width` is the exact page width (window width) so FlatList paging aligns.
 * Styling is standard React Native StyleSheet only.
 */
interface OnboardingSlideProps {
  item: OnboardingSlideData;
  width: number;
}

const BREATH_COLORS = ['#7C3AED', '#06B6D4', '#34D399'] as const;
const EVOLVE_COLORS = ['#F59E0B', '#EC4899', '#8B5CF6'] as const;

/** Slide 1 visual — slow breathing orb for intention setting. */
function IntentionVisual() {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.12 }],
    opacity: 0.92 + breath.value * 0.08,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.28 }],
    opacity: 0.65 - breath.value * 0.4,
  }));

  return (
    <View style={styles.visualWrap} accessibilityLabel="Slow breathing orb for focus">
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={orbStyle}>
        <LinearGradient
          colors={[...BREATH_COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orb}
        />
      </Animated.View>
      <Text style={styles.visualCaption}>Breathe in · Breathe out</Text>
    </View>
  );
}

/** Slide 2 visual — orbiting kinetic particles (placeholder for Skia sand sim). */
function EvolveVisual() {
  const orbit = useSharedValue(0);

  useEffect(() => {
    orbit.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [orbit]);

  const dotA = useAnimatedStyle(() => ({
    transform: [
      { translateX: -52 + orbit.value * 104 },
      { translateY: -24 + orbit.value * 48 },
      { scale: 1 + orbit.value * 0.4 },
    ],
    opacity: 0.7 + orbit.value * 0.3,
  }));

  const dotB = useAnimatedStyle(() => ({
    transform: [
      { translateX: 52 - orbit.value * 104 },
      { translateY: 24 - orbit.value * 48 },
      { scale: 1.3 - orbit.value * 0.4 },
    ],
    opacity: 1 - orbit.value * 0.3,
  }));

  const shape = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 90}deg` }, { scale: 1 + orbit.value * 0.15 }],
  }));

  return (
    <View style={styles.visualWrap} accessibilityLabel="Evolving kinetic particles and shapes">
      <Animated.View style={[styles.orbitRing, shape]} />
      <Animated.View style={[styles.particle, styles.particleA, dotA]} />
      <Animated.View style={[styles.particle, styles.particleB, dotB]} />
      <LinearGradient
        colors={[...EVOLVE_COLORS]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.evolveCore}
      />
    </View>
  );
}

/** Slide 3 visual — tranquil equilibrium: still concentric rings. */
function StillnessVisual() {
  const settle = useSharedValue(0);

  useEffect(() => {
    settle.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }),
        withTiming(0.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [settle]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + settle.value * 0.1 }],
    opacity: 0.5 - settle.value * 0.2,
  }));

  return (
    <View style={styles.visualWrap} accessibilityLabel="Tranquil equilibrium ring">
      <Animated.View style={[styles.stillHalo, haloStyle]} />
      <View style={styles.stillCore}>
        <View style={styles.stillDot} />
      </View>
      <Text style={styles.visualCaption}>Stillness, not alarms</Text>
    </View>
  );
}

export function OnboardingSlide({ item, width }: OnboardingSlideProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View style={[styles.container, { width }]}>
      {item.id === 'intention' ? (
        <IntentionVisual />
      ) : item.id === 'evolve' ? (
        <EvolveVisual />
      ) : (
        <StillnessVisual />
      )}

      <Text style={[styles.headline, isDark && styles.headlineDark]}>{item.headline}</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>{item.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  visualWrap: {
    height: 280,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualCaption: {
    position: 'absolute',
    bottom: 8,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.65)',
  },
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  orb: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  orbitRing: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  particle: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  particleA: {
    backgroundColor: '#F59E0B',
  },
  particleB: {
    backgroundColor: '#06B6D4',
  },
  evolveCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  stillHalo: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: 'rgba(52,211,153,0.55)',
  },
  stillCore: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stillDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34D399',
  },
  headline: {
    marginTop: 40,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    textAlign: 'center',
    color: '#ffffff',
  },
  headlineDark: {
    color: '#ffffff',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: '#D1D5DB',
  },
  subtitleDark: {
    color: '#D1D5DB',
  },
});
