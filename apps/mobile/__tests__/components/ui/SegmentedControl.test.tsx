import React from 'react';
import renderer from 'react-test-renderer';
import {SegmentedControl} from '../../../src/components/ui/SegmentedControl';
import {TouchableOpacity} from 'react-native';

describe('SegmentedControl', () => {
  it('calls onChange with correct value', () => {
    const onChangeMock = jest.fn();
    const options = [
      {label: 'Satu', value: '1'},
      {label: 'Dua', value: '2'},
    ];
    const component = renderer.create(
      <SegmentedControl options={options} value="1" onChange={onChangeMock} />,
    );

    const buttons = component.root.findAllByType(TouchableOpacity);
    expect(buttons.length).toBe(2);

    buttons[1]!.props.onPress();
    expect(onChangeMock).toHaveBeenCalledWith('2');
  });
});
