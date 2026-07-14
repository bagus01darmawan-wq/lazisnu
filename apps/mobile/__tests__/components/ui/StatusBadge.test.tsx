import React from 'react';
import renderer from 'react-test-renderer';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import { Text } from 'react-native';

describe('StatusBadge', () => {
  it('renders label correctly', () => {
    const component = renderer.create(<StatusBadge status="success" label="Berhasil" />);
    const text = component.root.findByType(Text);
    expect(text.props.children).toBe('Berhasil');
  });
});
