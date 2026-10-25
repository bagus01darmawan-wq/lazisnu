import React from 'react';
import renderer from 'react-test-renderer';
import {StatusBadge} from '../../../src/components/ui/StatusBadge';
import {Text} from 'react-native';

// React 19 + @react-native/jest-preset 0.88: create/update di luar act
// membuat root ter-unmount sebelum asersi. Bungkus dalam act + async.
const createAsync = async (element: React.ReactElement) => {
  let instance!: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    instance = renderer.create(element);
  });
  return instance;
};


describe('StatusBadge', () => {
  it('renders label correctly', async () => {
    const component = await createAsync(<StatusBadge status="success" label="Berhasil" />);
    const text = component.root.findByType(Text);
    expect(text.props.children).toBe('Berhasil');
  });
});
