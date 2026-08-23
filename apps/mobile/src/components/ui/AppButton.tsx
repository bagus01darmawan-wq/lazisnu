import React from 'react';
import {TouchableOpacity, Text, ActivityIndicator, StyleSheet, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, ComponentSizes, Radius, Typography, Spacing} from '../../theme';

type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
};

export const AppButton: React.FC<AppButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
}) => {
  const getContainerStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primaryContainer;
      case 'secondary':
        return styles.secondaryContainer;
      case 'outline':
        return styles.outlineContainer;
      case 'danger':
        return styles.dangerContainer;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'primary':
      case 'secondary':
      case 'danger':
        return styles.solidText;
      case 'outline':
        return styles.outlineText;
    }
  };

  const getIconColor = () => {
    if (disabled) {
      return Colors.text.muted;
    }
    return variant === 'outline' ? Colors.brand.deepGreen : Colors.text.white;
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{disabled: disabled || loading}}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.container,
        getContainerStyle(),
        fullWidth && styles.fullWidth,
        disabled && styles.disabledContainer,
      ]}>
      {loading ? (
        <ActivityIndicator color={getIconColor()} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={20} color={getIconColor()} style={styles.icon} />}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.text, getTextStyle(), disabled && styles.disabledText]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: ComponentSizes.buttonHeight,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  icon: {
    marginRight: Spacing.sm,
  },
  text: {
    ...Typography.button,
    flexShrink: 1,
    textAlign: 'center',
  },
  primaryContainer: {
    backgroundColor: Colors.brand.emerald,
  },
  secondaryContainer: {
    backgroundColor: Colors.brand.deepGreen,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.brand.deepGreen,
  },
  dangerContainer: {
    backgroundColor: Colors.status.error,
  },
  solidText: {
    color: Colors.text.white,
  },
  outlineText: {
    color: Colors.brand.deepGreen,
  },
  disabledContainer: {
    backgroundColor: Colors.border.default,
    borderColor: Colors.border.default,
  },
  disabledText: {
    color: Colors.text.muted,
  },
});
