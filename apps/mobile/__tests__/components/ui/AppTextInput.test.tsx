import React from 'react';
import renderer from 'react-test-renderer';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {AppTextInput} from '../../../src/components/ui/AppTextInput';

describe('AppTextInput', () => {
  it('keeps a decorative icon out of the accessibility tree', () => {
    const component = renderer.create(
      <AppTextInput value={''} onChangeText={jest.fn()} icon={'phone-outline'} />,
    );
    expect(component.root.findAllByType(Pressable)).toHaveLength(0);
    const decorative = component.root
      .findAllByType(View)
      .find(node => node.props.importantForAccessibility === 'no-hide-descendants');
    expect(decorative?.props.accessible).toBe(false);
  });

  it('exposes an interactive icon as a labelled button', () => {
    const onIconPress = jest.fn();
    const component = renderer.create(
      <AppTextInput
        value={''}
        onChangeText={jest.fn()}
        icon={'eye-outline'}
        onIconPress={onIconPress}
        iconAccessibilityLabel={'Tampilkan kata sandi'}
      />,
    );
    const button = component.root.findByType(Pressable);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Tampilkan kata sandi');
    button.props.onPress();
    expect(onIconPress).toHaveBeenCalledTimes(1);
  });

  it('forwards focus events to the consumer', () => {
    const onFocus = jest.fn();
    const component = renderer.create(
      <AppTextInput value={''} onChangeText={jest.fn()} onFocus={onFocus} />,
    );
    const input = component.root.findByType(TextInput);
    const event = {nativeEvent: {}};
    input.props.onFocus(event);
    expect(onFocus).toHaveBeenCalledWith(event);
  });

  it('expands its container for multiline text', () => {
    const component = renderer.create(
      <AppTextInput value={''} onChangeText={jest.fn()} multiline />,
    );
    const input = component.root.findByType(TextInput);
    const inputStyle = StyleSheet.flatten(input.props.style);
    expect(inputStyle.minHeight).toBe(110);
    expect(inputStyle.textAlignVertical).toBe('top');
  });
});
