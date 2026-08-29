import React from 'react';
import * as renderer from 'react-test-renderer';
import {Text, Pressable} from 'react-native';
import {AppPressable} from '../../../src/components/ui';

describe('AppPressable', () => {
  it('merender anak & memanggil onPress', async () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <AppPressable onPress={onPress} accessibilityLabel="Uji">
          <Text>Isi</Text>
        </AppPressable>,
      );
    });
    expect(tree.root.findAllByType(Text).some(n => n.props.children === 'Isi')).toBe(true);
    const btn = tree.root.findAllByType(Pressable)[0]!;
    await renderer.act(async () => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meneruskan disabled ke Pressable (guard internal RN)', async () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <AppPressable onPress={onPress} disabled>
          <Text>Isi</Text>
        </AppPressable>,
      );
    });
    const btn = tree.root.findAllByType(Pressable)[0]!;
    expect(btn.props.disabled).toBe(true);
  });
});
