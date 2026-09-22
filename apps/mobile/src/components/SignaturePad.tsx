import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet, PanResponder, type GestureResponderEvent} from 'react-native';
import Svg, {Polyline} from 'react-native-svg';
import {Colors, Radius, Spacing, Typography} from '../theme';
import {hasInk, rasterizeStrokes, type Stroke} from '../signature/signaturePng';
import {AppPressable} from './ui/AppPressable';

type SignaturePadProps = {
  onChange: (strokes: Stroke[], hasContent: boolean) => void;
};

/**
 * C1-T10 — Kanvas coretan TTD (jari/stylus).
 * Pratinjau via Polyline SVG; raster PNG dikerjakan pemanggil lewat
 * `strokesToSignaturePng` (encoder murni, tanpa dep native) agar komponen
 * tetap bodoh dan teruji. Ukuran view dilaporkan via onLayout oleh pemanggil
 * (lihat SignSheet).
 */
export const SignaturePad = React.forwardRef<View, SignaturePadProps>(function SignaturePad(
  {onChange},
  ref,
) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke>([]);
  const size = useRef({w: 300, h: 150});
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  const push = (next: Stroke[]) => {
    setStrokes(next);
    const px = rasterizeStrokes(next, size.current.w, size.current.h);
    onChange(next, hasInk(px));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        current.current = [{x: e.nativeEvent.locationX, y: e.nativeEvent.locationY}];
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        current.current = [
          ...current.current,
          {x: e.nativeEvent.locationX, y: e.nativeEvent.locationY},
        ];
        push([...strokesRef.current, current.current]);
      },
      onPanResponderRelease: () => {
        push([...strokesRef.current, current.current]);
        current.current = [];
      },
    }),
  ).current;

  const clear = () => {
    current.current = [];
    push([]);
  };

  return (
    <View>
      <View
        ref={ref}
        style={styles.pad}
        onLayout={e => {
          size.current = {w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height};
        }}
        {...responder.panHandlers}>
        <Svg width="100%" height="100%">
          {strokes.map((s, i) => (
            <Polyline
              key={i}
              points={s.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={Colors.text.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {strokes.length === 0 ? <Text style={styles.hint}>Coret di sini (jari/stylus)</Text> : null}
      </View>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Hapus coretan"
        onPress={clear}
        style={styles.clearBtn}>
        <Text style={styles.clearText}>Hapus</Text>
      </AppPressable>
    </View>
  );
});

const styles = StyleSheet.create({
  pad: {
    height: 150,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border.warm,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {...Typography.caption},
  clearBtn: {alignSelf: 'flex-end', padding: Spacing.sm},
  clearText: {...Typography.caption, fontWeight: '700'},
});
