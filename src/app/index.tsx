import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingSlide } from '@/components/OnboardingSlide';
import { Pagination } from '@/components/Pagination';
import {
  ONBOARDING_SLIDES,
  setIsOnboarded,
  type OnboardingSlideData,
} from '@/constants/onboarding';

/**
 * Swipeable onboarding carousel.
 * Route: `src/app/index.tsx` — this is the launch screen.
 *
 * - FlatList + Reanimated `scrollX` drives the animated pill Pagination.
 * - Skip (top-right) + Next / Get Started (bottom) with expo-haptics feedback.
 * - Get Started persists `isOnboarded` via AsyncStorage.
 *
 * NativeWind/Tailwind: StyleSheet is the source of truth so this works without
 * extra setup. Each block notes its className equivalent where trivial.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<OnboardingSlideData>>(null);

  const scrollX = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const isLast = activeIndex === ONBOARDING_SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex((prev) => {
        if (prev !== next) void Haptics.selectionAsync();
        return next;
      });
    },
    [width],
  );

  const goToIndex = useCallback(
    (index: number) => {
      listRef.current?.scrollToIndex({ index, animated: true });
      setActiveIndex(index);
    },
    [],
  );

  const finishOnboarding = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics are best-effort (e.g. Low Power Mode, web without vibration).
    }
    await setIsOnboarded(true);
    router.replace('/(tabs)');
  }, [isFinishing, router]);

  const handleSkip = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // ignore
    }
    await finishOnboarding();
  }, [finishOnboarding]);

  const handlePrimary = useCallback(async () => {
    try {
      await Haptics.impactAsync(
        isLast ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );
    } catch {
      // ignore
    }
    if (isLast) {
      await finishOnboarding();
    } else {
      goToIndex(activeIndex + 1);
    }
  }, [activeIndex, finishOnboarding, goToIndex, isLast]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0B0620', '#1E1B4B', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Skip — top-right */}
      <View style={[styles.skipWrap, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={12}
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* Swipeable pages */}
      <Animated.FlatList
        ref={listRef as never}
        data={[...ONBOARDING_SLIDES]}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => <OnboardingSlide item={item} width={width} />}
      />

      {/* Bottom controls: pagination pills + Next / Get Started */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + 24 },
        ]}>
        <Pagination
          count={ONBOARDING_SLIDES.length}
          scrollX={scrollX}
          pageWidth={width}
          activeIndex={activeIndex}
          onDotPress={goToIndex}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
          onPress={handlePrimary}
          style={({ pressed }) => [styles.primaryShadow, pressed && styles.pressed]}>
          <LinearGradient
            colors={['#F59E0B', '#EC4899', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryButton}>
            <Text style={styles.primaryText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0620',
  },
  skipWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  primaryShadow: {
    borderRadius: 999,
    shadowColor: '#EC4899',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 148,
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
});
