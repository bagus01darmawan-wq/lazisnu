import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, ComponentSizes, Radius, Spacing, Typography} from '../../theme';

type AppTextInputProps = TextInputProps & {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: string;
  onIconPress?: () => void;
  iconAccessibilityLabel?: string;
};

export const AppTextInput: React.FC<AppTextInputProps> = ({
  label,
  error,
  helperText,
  icon,
  onIconPress,
  iconAccessibilityLabel,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const iconColor = error ? Colors.status.error : Colors.text.muted;

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          props.multiline && styles.inputContainerMultiline,
          isFocused && styles.inputFocused,
          !!error && styles.inputError,
          props.editable === false && styles.inputDisabled,
        ]}>
        <TextInput
          style={[styles.input, props.multiline && styles.inputMultiline, style]}
          placeholderTextColor={Colors.text.muted}
          onFocus={event => {
            setIsFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={event => {
            setIsFocused(false);
            props.onBlur?.(event);
          }}
          {...props}
        />
        {!!icon && onIconPress ? (
          <Pressable
            accessibilityRole={'button'}
            accessibilityLabel={iconAccessibilityLabel || 'Aksi input'}
            hitSlop={8}
            onPress={onIconPress}
            style={styles.iconButton}>
            <Icon name={icon} size={24} color={iconColor} />
          </Pressable>
        ) : icon ? (
          <View
            accessible={false}
            importantForAccessibility={'no-hide-descendants'}
            style={styles.decorativeIcon}>
            <Icon name={icon} size={24} color={iconColor} />
          </View>
        ) : null}
      </View>
      {!!(error || helperText) && (
        <Text
          style={[styles.helperText, !!error && styles.errorText]}
          accessibilityRole={error ? 'alert' : undefined}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {marginBottom: Spacing.md},
  label: {...Typography.label, marginBottom: Spacing.xs},
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ComponentSizes.inputHeight,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface.card,
    paddingLeft: Spacing.md,
  },
  inputFocused: {borderColor: Colors.border.focus},
  inputContainerMultiline: {
    height: 'auto',
    minHeight: 112,
    alignItems: 'flex-start',
  },
  inputError: {borderColor: Colors.status.error},
  inputDisabled: {
    backgroundColor: Colors.surface.page,
    borderColor: Colors.border.default,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: Colors.text.primary,
    height: '100%',
    paddingRight: Spacing.sm,
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    textAlignVertical: 'top',
  },
  iconButton: {
    width: ComponentSizes.minimumTouchTarget,
    height: ComponentSizes.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorativeIcon: {
    width: ComponentSizes.minimumTouchTarget,
    height: ComponentSizes.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {...Typography.caption, marginTop: Spacing.xs, color: Colors.text.secondary},
  errorText: {color: Colors.status.error},
});
