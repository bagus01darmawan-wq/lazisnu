import React from 'react';
import renderer from 'react-test-renderer';
import {SyncBanner} from '../../../src/components/ui/SyncBanner';
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


describe('SyncBanner', () => {
  it('renders default text for synced status', async () => {
    const component = await createAsync(<SyncBanner status="synced" />);
    const texts = component.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Semua data tersinkronisasi');
  });

  it('renders custom text and subtext when provided', async () => {
    const component = await createAsync(
      <SyncBanner
        status="offline"
        text="3 data menunggu sinkronisasi"
        subtext="Akan dikirim otomatis saat online"
      />,
    );
    const texts = component.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('3 data menunggu sinkronisasi');
    expect(texts).toContain('Akan dikirim otomatis saat online');
  });

  it('renders pending count correctly when count is provided', async () => {
    const component = await createAsync(<SyncBanner status="offline" count={5} />);
    const texts = component.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('5 data belum tersinkronisasi');
  });

  it('handles onPress when provided', async () => {
    const onPressMock = jest.fn();
    const component = await createAsync(
      <SyncBanner status="failed" text="Gagal kirim" onPress={onPressMock} />,
    );
    const button = component.root.findByType(TouchableOpacity);
    button.props.onPress();
    expect(onPressMock).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Gagal kirim');
  });
});
