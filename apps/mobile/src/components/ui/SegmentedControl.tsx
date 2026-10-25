import React from 'react';
import {StyleProp, View, Text, TouchableOpacity, ViewStyle, StyleSheet} from 'react-native';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export type SegmentOption<T extends string> = {
  label: string;
  value: T;
  /** Warna label saat segmen terpilih (mis. warning/error); default teks primer. */
  activeColor?: string;
  /** Warna latar segmen saat terpilih; default kartu putih. */
  activeBackgroundColor?: string;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map(option => {
        const isSelected = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.segment,
              isSelected && styles.segmentSelected,
              isSelected &&
                option.activeBackgroundColor != null && {
                  backgroundColor: option.activeBackgroundColor,
                },
            ]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{selected: isSelected}}>
            <Text
              style={[
                styles.label,
                isSelected && styles.labelSelected,
                isSelected && option.activeColor != null && {color: option.activeColor},
              ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.border.default,
    borderRadius: Radius.pill,
    padding: Spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  segmentSelected: {
    backgroundColor: Colors.surface.card,
    shadowColor: Colors.overlay.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    ...Typography.button,
    color: Colors.text.muted,
  },
  labelSelected: {
    color: Colors.text.primary,
  },
});
