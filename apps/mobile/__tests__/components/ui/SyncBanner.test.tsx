import React from 'react';
import renderer from 'react-test-renderer';
import {SyncBanner} from '../../../src/components/ui/SyncBanner';
import {Text, TouchableOpacity} from 'react-native';

describe('SyncBanner', () => {
  it('renders default text for synced status', () => {
    const component = renderer.create(<SyncBanner status="synced" />);
    const texts = component.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Semua data tersinkronisasi');
  });

  it('renders custom text and subtext when provided', () => {
    const component = renderer.create(
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

  it('renders pending count correctly when count is provided', () => {
    const component = renderer.create(<SyncBanner status="offline" count={5} />);
    const texts = component.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('5 data belum tersinkronisasi');
  });

  it('handles onPress when provided', () => {
    const onPressMock = jest.fn();
    const component = renderer.create(
      <SyncBanner status="failed" text="Gagal kirim" onPress={onPressMock} />,
    );
    const button = component.root.findByType(TouchableOpacity);
    button.props.onPress();
    expect(onPressMock).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Gagal kirim');
  });
});
