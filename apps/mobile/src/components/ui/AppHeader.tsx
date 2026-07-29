import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import { Colors, ComponentSizes, Spacing, Typography } from '../../theme';

type AppHeaderVariant = 'auth' | 'main' | 'stack';

type AppHeaderProps = {
  variant: AppHeaderVariant;
  title?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  variant,
  title,
  onBack,
  rightAction,
}) => {
  const insets = useSafeAreaInsets();

  if (variant === 'auth') {
    return (
      <View style={[styles.container, styles.authContainer]}>
        <Icon name="mosque" size={48} color={Colors.brand.emerald} />
        {title && <Text style={styles.authTitle}>{title}</Text>}
      </View>
    );
  }

  if (variant === 'main') {
    return (
      <View
        style={[
          styles.container,
          styles.safeContainer,
          {paddingTop: insets.top, height: ComponentSizes.buttonHeight + insets.top},
        ]}>
        <View style={styles.mainLeft}>
          <Icon name="mosque" size={32} color={Colors.brand.emerald} />
          {title && <Text style={styles.mainTitle}>{title}</Text>}
        </View>
        <View style={styles.rightAction}>{rightAction}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.safeContainer,
        {paddingTop: insets.top, height: ComponentSizes.buttonHeight + insets.top},
      ]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Kembali"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon name="arrow-left" size={24} color={Colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.stackTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rightAction}>{rightAction}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ComponentSizes.buttonHeight,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface.page,
  },
  safeContainer: {
    backgroundColor: Colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  authContainer: {
    flexDirection: 'column',
    height: 'auto',
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
  },
  authTitle: {
    ...Typography.heading1,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  mainLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainTitle: {
    ...Typography.heading2,
    marginLeft: Spacing.sm,
  },
  backButton: {
    marginRight: Spacing.md,
    minHeight: ComponentSizes.minimumTouchTarget,
    minWidth: ComponentSizes.minimumTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-start', // supaya touch target lebar tapi icon di kiri
  },
  stackTitle: {
    ...Typography.heading3,
    flex: 1,
  },
  rightAction: {
    minHeight: ComponentSizes.minimumTouchTarget,
    minWidth: ComponentSizes.minimumTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
