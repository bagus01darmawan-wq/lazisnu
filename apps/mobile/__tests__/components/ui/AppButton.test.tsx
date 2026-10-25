import React from 'react';
import renderer from 'react-test-renderer';
import {AppButton} from '../../../src/components/ui/AppButton';
import {Text, TouchableOpacity} from 'react-native';

// React 19 + @react-native/jest-preset 0.88: create/update di luar act
// membuat root ter-unmount sebelum asersi. Bungkus dalam act + async.
const createAsync = async (element: React.ReactElement) => {
  let instance!: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    instance = renderer.create(element);
  });
  return instance;
};


describe('AppButton', () => {
  it('calls onPress when clicked', async () => {
    const onPressMock = jest.fn();
    const component = await createAsync(<AppButton label="Test" onPress={onPressMock} />);
    const button = component.root.findByType(TouchableOpacity);

    button.props.onPress();
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', async () => {
    const onPressMock = jest.fn();
    const component = await createAsync(<AppButton label="Test" onPress={onPressMock} disabled />);
    const button = component.root.findByType(TouchableOpacity);

    expect(button.props.disabled).toBe(true);
  });

  it('is disabled when loading', async () => {
    const onPressMock = jest.fn();
    const component = await createAsync(<AppButton label="Test" onPress={onPressMock} loading />);
    const button = component.root.findByType(TouchableOpacity);

    expect(button.props.disabled).toBe(true);
  });

  it('keeps long labels on one responsive line', async () => {
    const component = await createAsync(
      <AppButton label={'Simpan Koreksi Penjemputan'} onPress={jest.fn()} />,
    );
    const label = component.root.findByType(Text);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.minimumFontScale).toBe(0.8);
  });
});
