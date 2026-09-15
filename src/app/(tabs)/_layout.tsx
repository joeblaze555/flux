import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { PREFS_KEY } from './settings';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const ACTIVE_TINT = '#8B5CF6';
const INACTIVE_TINT = '#6B7280';

function TabBarIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} size={size} color={color as string} />;
}

const hapticTabPress = {
  tabPress: () => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            (parsed as { hapticLevel?: unknown }).hapticLevel === 'off'
          ) {
            return;
          }
        }
      } catch {
        // Unknown preference — fall through to default feedback.
      }
      try {
        await Haptics.selectionAsync();
      } catch {
        // Best effort.
      }
    })();
  },
};

function TabBarBackground() {
  return (
    <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill}>
      <View style={styles.backgroundOverlay} />
    </BlurView>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_TINT,
        tabBarInactiveTintColor: INACTIVE_TINT,
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tabs.Screen
        name="index"
        listeners={hapticTabPress}
        options={{
          title: 'Timer',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="timer-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        listeners={hapticTabPress}
        options={{
          title: 'Presets',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="color-palette-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        listeners={hapticTabPress}
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        listeners={hapticTabPress}
        options={{
          title: 'Preferences',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    height: 64,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  backgroundOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 15, 25, 0.72)',
  },
});
