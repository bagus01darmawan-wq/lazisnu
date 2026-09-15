import React from 'react';
import {StyleProp, View, Text, TouchableOpacity, ViewStyle, StyleSheet} from 'react-native';
import {Colors, Radius, Spacing, Typography, ComponentSizes} from '../../theme';

export type OptionItem<T extends string> = {
  label: string;
  value: T;
  /** Keterangan kecil di bawah label (mis. efek samping otomatis). */
  hint?: string;
};

type OptionListProps<T extends string> = {
  options: ReadonlyArray<OptionItem<T>>;
  value: T | null;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Daftar pilihan radio bertanda (khusus pilihan tunggal wajib).
 *
 * Mengikuti gaya SegmentedControl: hangat, minimal, dan target sentuh >= 44px.
 * Dipakai untuk memilih alasan "tidak terjemput" agar petugas wajib menjelaskan
 * alasannya, bukan sekadar konfirmasi Ya/Batal.
 */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  style,
}: OptionListProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map(option => {
        const isSelected = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.item, isSelected && styles.itemSelected]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{selected: isSelected}}>
            <View
              style={[
                styles.radioOuter,
                isSelected ? styles.radioOuterSelected : undefined,
              ]}>
              {isSelected ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.textContent}>
              <Text style={[styles.label, isSelected && styles.labelSelected]}>
                {option.label}
              </Text>
              {option.hint ? (
                <Text style={styles.hint} numberOfLines={2}>
                  {option.hint}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ComponentSizes.minimumTouchTarget,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border.warm,
    backgroundColor: Colors.surface.card,
  },
  itemSelected: {
    borderColor: Colors.brand.emerald,
    backgroundColor: Colors.surface.successSoft,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border.warm,
  },
  radioOuterSelected: {
    borderColor: Colors.brand.emerald,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand.emerald,
  },
  textContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  label: {
    ...Typography.body,
    color: Colors.text.primary,
  },
  labelSelected: {
    fontWeight: '700',
  },
  hint: {
    ...Typography.caption,
    color: Colors.text.muted,
    marginTop: 2,
  },
});
