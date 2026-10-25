import React from 'react';
import renderer from 'react-test-renderer';
import {SegmentedControl} from '../../../src/components/ui/SegmentedControl';
import {TouchableOpacity} from 'react-native';

// React 19 + @react-native/jest-preset 0.88: create/update di luar act
// membuat root ter-unmount sebelum asersi. Bungkus dalam act + async.
const createAsync = async (element: React.ReactElement) => {
  let instance!: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    instance = renderer.create(element);
  });
  return instance;
};


describe('SegmentedControl', () => {
  it('calls onChange with correct value', async () => {
    const onChangeMock = jest.fn();
    const options = [
      {label: 'Satu', value: '1'},
      {label: 'Dua', value: '2'},
    ];
    const component = await createAsync(
      <SegmentedControl options={options} value="1" onChange={onChangeMock} />,
    );

    const buttons = component.root.findAllByType(TouchableOpacity);
    expect(buttons.length).toBe(2);

    buttons[1]!.props.onPress();
    expect(onChangeMock).toHaveBeenCalledWith('2');
  });
});
