import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/**
 * Interactive animated pill indicators.
 * Each pill expands (8 -> 28) and brightens as `scrollX` approaches its page.
 *
 * NativeWind/Tailwind: container maps to "flex-row items-center gap-2".
 * Animated width/opacity must stay in Reanimated styles (cannot be className).
 */
interface PaginationProps {
  count: number;
  /** Shared scroll offset in px (pageWidth * fractionalIndex). */
  scrollX: SharedValue<number>;
  pageWidth: number;
  activeIndex: number;
  onDotPress: (index: number) => void;
}

const DOT = 8;
const ACTIVE_DOT = 28;

function Pill({
  index,
  scrollX,
  pageWidth,
  onDotPress,
}: {
  index: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
  onDotPress: (index: number) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * pageWidth,
      index * pageWidth,
      (index + 1) * pageWidth,
    ] as const;

    return {
      width: interpolate(scrollX.value, [...input], [DOT, ACTIVE_DOT, DOT], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, [...input], [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Go to slide ${index + 1}`}
      hitSlop={10}
      onPress={() => {
        void Haptics.selectionAsync();
        onDotPress(index);
      }}>
      <Animated.View style={[styles.pill, animatedStyle]} />
    </Pressable>
  );
}

export function Pagination({ count, scrollX, pageWidth, activeIndex, onDotPress }: PaginationProps) {
  void activeIndex;
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, i) => (
        <Pill key={`pill-${i}`} index={i} scrollX={scrollX} pageWidth={pageWidth} onDotPress={onDotPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
});
