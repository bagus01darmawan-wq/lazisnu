// Mock react-native-vector-icons/MaterialCommunityIcons untuk Jest.
//
// Latar belakang: package react-native-vector-icons TIDAK mendeklarasikan
// react sebagai dependency/peer dependency, sehingga di pnpm resolve 'react'
// jatuh ke hoisting `.pnpm/node_modules/react` yang menunjuk react@19.2.4
// (dipakai apps/web — Next 16), sedangkan react-test-renderer memakai
// react@18.2.0. Elemen React 19 ditolak renderer React 18 →
// "Objects are not valid as a React child" (murni masalah resolusi Jest,
// app runtime tidak terpengaruh — Metro resolve react 18 dari apps/mobile).
//
// Mock ini render ikon sebagai <Text> — cukup untuk test aksesibilitas/
// interaksi; glyph/font tidak relevan di unit test.

import React from 'react';
import {Text, type TextProps} from 'react-native';

type IconProps = TextProps & {
  name?: string;
  size?: number;
  color?: string;
};

const MaterialCommunityIcons = ({name, size = 12, color, style, ...props}: IconProps) => (
  <Text {...props} style={[{fontSize: size, color}, style]} testID={`icon-${name ?? ''}`}>
    {name ?? ''}
  </Text>
);

export default MaterialCommunityIcons;
