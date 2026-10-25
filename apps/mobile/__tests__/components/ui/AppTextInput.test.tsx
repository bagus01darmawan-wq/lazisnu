import React from 'react';
import renderer from 'react-test-renderer';
import {StyleSheet, TextInput, View} from 'react-native';
import {AppTextInput} from '../../../src/components/ui/AppTextInput';

// React 19 + @react-native/jest-preset 0.88: create/update di luar act
// membuat root ter-unmount sebelum asersi. Bungkus dalam act + async.
const createAsync = async (element: React.ReactElement) => {
  let instance!: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    instance = renderer.create(element);
  });
  return instance;
};

// React 19: fiber membawa tipe INNER dari komponen ber-memo (Pressable diekspor
// sebagai react.memo), jadi findAllByType(Pressable) tidak pernah cocok —
// cari berdasarkan nama fungsi internalnya.
const findPressables = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as {name?: string} | undefined)?.name === 'Pressable');

describe('AppTextInput', () => {
  it('keeps a decorative icon out of the accessibility tree', async () => {
    const component = await createAsync(
      <AppTextInput value={''} onChangeText={jest.fn()} icon={'phone-outline'} />,
    );
    expect(findPressables(component)).toHaveLength(0);
    const decorative = component.root
      .findAllByType(View)
      .find(node => node.props.importantForAccessibility === 'no-hide-descendants');
    expect(decorative?.props.accessible).toBe(false);
  });

  it('exposes an interactive icon as a labelled button', async () => {
    const onIconPress = jest.fn();
    const component = await createAsync(
      <AppTextInput
        value={''}
        onChangeText={jest.fn()}
        icon={'eye-outline'}
        onIconPress={onIconPress}
        iconAccessibilityLabel={'Tampilkan kata sandi'}
      />,
    );
    const button = findPressables(component)[0]!;
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Tampilkan kata sandi');
    button.props.onPress();
    expect(onIconPress).toHaveBeenCalledTimes(1);
  });

  it('forwards focus events to the consumer', async () => {
    const onFocus = jest.fn();
    const component = await createAsync(
      <AppTextInput value={''} onChangeText={jest.fn()} onFocus={onFocus} />,
    );
    const input = component.root.findByType(TextInput);
    const event = {nativeEvent: {}};
    input.props.onFocus(event);
    expect(onFocus).toHaveBeenCalledWith(event);
  });

  it('expands its container for multiline text', async () => {
    const component = await createAsync(
      <AppTextInput value={''} onChangeText={jest.fn()} multiline />,
    );
    const input = component.root.findByType(TextInput);
    const inputStyle = StyleSheet.flatten(input.props.style);
    expect(inputStyle.minHeight).toBe(110);
    expect(inputStyle.textAlignVertical).toBe('top');
  });
});
