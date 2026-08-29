import React from 'react';
import {Pressable, PressableProps, StyleProp, ViewStyle} from 'react-native';

export interface AppPressableProps extends PressableProps {
  pressedOpacity?: number;
  style?: StyleProp<ViewStyle>;
}

/** Touchable modern (Pressable) dengan feedback opacity ala TouchableOpacity.
 *  Konvensi repo: komponen BARU memakai ini; TouchableOpacity lama tidak dipaksa migrasi. */
export const AppPressable: React.FC<AppPressableProps> = ({
  pressedOpacity = 0.8,
  style,
  children,
  disabled,
  ...rest
}) => (
  <Pressable
    disabled={disabled}
    style={({pressed}) => [
      style as StyleProp<ViewStyle>,
      pressed && !disabled ? {opacity: pressedOpacity} : null,
    ]}
    {...rest}>
    {children}
  </Pressable>
);
