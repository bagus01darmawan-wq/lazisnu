import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Shadows, Spacing } from '../../theme';

type AppCardVariant = 'default' | 'elevated' | 'dark' | 'glass';

type AppCardProps = {
  children: React.ReactNode;
  variant?: AppCardVariant;
  style?: ViewStyle | ViewStyle[];
};

export const AppCard: React.FC<AppCardProps> = ({
  children,
  variant = 'default',
  style,
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'default':
        return [styles.default, Shadows.soft];
      case 'elevated':
        return [styles.elevated, Shadows.medium];
      case 'dark':
        return [styles.dark, Shadows.medium];
      case 'glass':
        return [styles.glass, Shadows.strong];
    }
  };

  return (
    <View style={[styles.container, getVariantStyle(), style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.card,
    padding: Spacing.lg,
  },
  default: {
    backgroundColor: Colors.surface.card,
  },
  elevated: {
    backgroundColor: Colors.surface.card,
  },
  dark: {
    backgroundColor: Colors.surface.dark,
  },
  glass: {
    backgroundColor: Colors.surface.glass,
  },
});
