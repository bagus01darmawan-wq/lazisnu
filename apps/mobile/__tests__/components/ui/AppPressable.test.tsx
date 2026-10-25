import React from 'react';
import * as renderer from 'react-test-renderer';
import {Text} from 'react-native';
import {AppPressable} from '../../../src/components/ui';

// React 19 + react-test-renderer 19: fiber membawa tipe INNER dari komponen
// yang dibungkus memo (Pressable diekspor sebagai react.memo), sehingga
// findAllByType(Pressable) tidak pernah cocok. Cari berdasarkan nama fungsi
// internalnya.
const findPressable = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as {name?: string} | undefined)?.name === 'Pressable')[0]!;

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
    const btn = findPressable(tree);
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
    const btn = findPressable(tree);
    expect(btn.props.disabled).toBe(true);
  });
});
