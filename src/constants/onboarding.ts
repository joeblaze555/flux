import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent flag set when the user finishes (or skips) onboarding.
 * Read in `src/app/_layout.tsx` to skip onboarding on return visits.
 */
export const ONBOARDED_KEY = 'isOnboarded';

export type OnboardingSlideId = 'intention' | 'evolve' | 'stillness';

export interface OnboardingSlideData {
  id: OnboardingSlideId;
  headline: string;
  subtitle: string;
  /** Accessibility label for the visual. */
  visualLabel: string;
}

export const ONBOARDING_SLIDES: readonly OnboardingSlideData[] = [
  {
    id: 'intention',
    headline: 'Set Your Intention',
    subtitle:
      'Choose a duration and settle in. Flux is a focus and meditation timer — no noise, just presence.',
    visualLabel: 'Slow breathing orb for focus',
  },
  {
    id: 'evolve',
    headline: 'Watch It Evolve',
    subtitle:
      'Time becomes motion. Procedural sand and kinetic geometry shift as your session unfolds.',
    visualLabel: 'Evolving kinetic particles and shapes',
  },
  {
    id: 'stillness',
    headline: 'Settle in Stillness',
    subtitle:
      'When time expires, the art rests into calm equilibrium. No alarms — just quiet arrival.',
    visualLabel: 'Tranquil equilibrium ring',
  },
] as const;

export async function getIsOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setIsOnboarded(value = true): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, value ? 'true' : 'false');
  } catch {
    // Storage is best-effort — navigation still proceeds.
  }
}
