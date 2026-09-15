import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadPrefs } from './settings';
import type { HapticLevel } from '@/hooks/useTimerEngine';

const BG = '#0B0F19';
const CARD = 'rgba(30, 41, 59, 0.65)';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const TEXT = '#F3F4F6';
const MUTED = '#9CA3AF';
const ACCENT = '#8B5CF6';

export const PRESET_KEY = 'flux:selectedPreset';

export interface ArtPreset {
  id: string;
  title: string;
  description: string;
  colors: [string, string];
  icon: 'hourglass-outline' | 'ellipse-outline' | 'water-outline';
}

export const ART_PRESETS: readonly ArtPreset[] = [
  {
    id: 'sand',
    title: 'Sifting Sand',
    description: 'Particles fall and settle as time drains away.',
    colors: ['#F59E0B', '#8B5CF6'],
    icon: 'hourglass-outline',
  },
  {
    id: 'orbs',
    title: 'Morphing Orbs',
    description: 'Geometric forms breathe and reshape with progress.',
    colors: ['#06B6D4', '#8B5CF6'],
    icon: 'ellipse-outline',
  },
  {
    id: 'fluid',
    title: 'Still Fluid',
    description: 'Slow currents that calm into equilibrium at zero.',
    colors: ['#34D399', '#06B6D4'],
    icon: 'water-outline',
  },
] as const;

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string>('sand');
  const hapticRef = useRef<HapticLevel>('medium');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(PRESET_KEY);
        if (saved) setSelectedId(saved);
      } catch {
        // Best effort.
      }
    })();
  }, []);

  // Keep the cached haptic level fresh so "off" is honored here too.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          hapticRef.current = (await loadPrefs()).hapticLevel;
        } catch {
          // Best effort — default remains.
        }
      })();
    }, []),
  );
  const handleSelect = useCallback(async (id: string) => {
    if (hapticRef.current !== 'off') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // Haptics best-effort.
      }
    }
    setSelectedId(id);
    try {
      await AsyncStorage.setItem(PRESET_KEY, id);
    } catch {
      // Storage best-effort.
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(450)}>
          <Text style={styles.title}>Art Presets</Text>
          <Text style={styles.subtitle}>Choose the kinetic visual for your next session</Text>
        </Animated.View>

        <View style={styles.cardList}>
          {ART_PRESETS.map((preset, index) => {
            const active = preset.id === selectedId;
            return (
              <Animated.View
                key={preset.id}
                entering={FadeInDown.duration(400).delay(Math.min(index, 6) * 60)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select preset: ${preset.title}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => handleSelect(preset.id)}
                  style={({ pressed }) => [
                    styles.card,
                    active && styles.cardActive,
                    pressed && styles.pressed,
                  ]}>
                  <LinearGradient
                    colors={preset.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.preview}>
                    <Ionicons name={preset.icon} size={34} color="#fff" />
                  </LinearGradient>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{preset.title}</Text>
                    <Text style={styles.cardDescription}>{preset.description}</Text>
                    <View style={styles.cardFooter}>
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={active ? ACCENT : MUTED}
                      />
                      <Text style={[styles.selectText, active && styles.selectTextActive]}>
                        {active ? 'Selected' : 'Tap to select'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <Text style={styles.note}>
          Your selection drives the kinetic timer canvas instantly and is saved on this device.
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
  scrollContent: {
    paddingHorizontal: 20,
    gap: 18,
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
  cardList: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  cardActive: {
    borderColor: ACCENT,
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  selectText: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
  },
  selectTextActive: {
    color: ACCENT,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
