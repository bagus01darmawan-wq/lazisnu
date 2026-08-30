import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppPressable} from './ui/AppPressable';
import {Colors, Radius, Shadows, Spacing, Typography} from '../theme';

const TAB_ICONS: Record<string, {active: string; inactive: string}> = {
  Dashboard: {active: 'home-variant', inactive: 'home-variant-outline'},
  Tasks: {active: 'clipboard-text-clock', inactive: 'clipboard-text-clock-outline'},
  History: {active: 'history', inactive: 'history'},
  Profile: {active: 'account-circle', inactive: 'account-circle-outline'},
};

// Tab bar kustom ala mockup "Emerald Royal": pil putih mengambang dengan
// tombol Scan sebagai FAB emerald yang terangkat di tengah.
export const FloatingTabBar: React.FC<BottomTabBarProps> = ({state, descriptors, navigation}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, {paddingBottom: Math.max(insets.bottom, Spacing.md)}]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const isFocused = state.index === index;
          const label =
            typeof options?.title === 'string'
              ? options.title
              : typeof options?.tabBarLabel === 'string'
                ? options.tabBarLabel
                : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          const onLongPress = () => {
            navigation.emit({type: 'tabLongPress', target: route.key});
          };

          if (route.name === 'Scan') {
            return (
              <AppPressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole={'button'}
                accessibilityLabel={label}
                accessibilityState={{selected: isFocused}}
                style={styles.fabWrap}>
                <LinearGradient
                  colors={[Colors.brand.emerald, Colors.brand.heroEnd]}
                  start={{x: 0.2, y: 0}}
                  end={{x: 0.8, y: 1}}
                  style={styles.fab}>
                  <Icon name={'line-scan'} size={26} color={Colors.text.white} />
                </LinearGradient>
                <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
              </AppPressable>
            );
          }

          const icons = TAB_ICONS[route.name];
          const iconName = isFocused ? icons?.active : icons?.inactive;
          const color = isFocused ? Colors.brand.emerald : Colors.text.muted;

          return (
            <AppPressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole={'button'}
              accessibilityLabel={label}
              accessibilityState={{selected: isFocused}}
              style={styles.item}>
              <Icon name={iconName ?? 'circle-outline'} size={24} color={color} />
              <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </AppPressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: Spacing.md,
    height: 68,
    borderRadius: Radius.panel + 2,
    backgroundColor: Colors.surface.card,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    ...Shadows.strong,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 62,
    gap: 3,
  },
  label: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.muted,
  },
  labelActive: {color: Colors.brand.emerald},
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 62,
    height: '100%',
    paddingBottom: 10,
  },
  fab: {
    position: 'absolute',
    top: -26,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.surface.page,
    ...Shadows.medium,
  },
});

export default FloatingTabBar;
