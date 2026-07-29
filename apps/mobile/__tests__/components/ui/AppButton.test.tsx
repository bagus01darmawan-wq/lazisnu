import React from 'react';
import renderer from 'react-test-renderer';
import { AppButton } from '../../../src/components/ui/AppButton';
import {Text, TouchableOpacity} from 'react-native';

describe('AppButton', () => {
  it('calls onPress when clicked', () => {
    const onPressMock = jest.fn();
    const component = renderer.create(<AppButton label="Test" onPress={onPressMock} />);
    const button = component.root.findByType(TouchableOpacity);

    button.props.onPress();
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const onPressMock = jest.fn();
    const component = renderer.create(<AppButton label="Test" onPress={onPressMock} disabled />);
    const button = component.root.findByType(TouchableOpacity);

    expect(button.props.disabled).toBe(true);
  });

  it('is disabled when loading', () => {
    const onPressMock = jest.fn();
    const component = renderer.create(<AppButton label="Test" onPress={onPressMock} loading />);
    const button = component.root.findByType(TouchableOpacity);

    expect(button.props.disabled).toBe(true);
  });

  it('keeps long labels on one responsive line', () => {
    const component = renderer.create(
      <AppButton label={'Simpan Koreksi Penjemputan'} onPress={jest.fn()} />,
    );
    const label = component.root.findByType(Text);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.minimumFontScale).toBe(0.8);
  });
});
