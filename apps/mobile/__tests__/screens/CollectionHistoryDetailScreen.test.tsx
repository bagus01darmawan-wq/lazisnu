import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import {SyncStatus} from '@lazisnu/shared-types';
import {CollectionHistoryDetailScreen} from '../../src/screens/history/CollectionHistoryDetailScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

const item = {
  id: 'collection-1',
  assignment_id: 'assignment-1',
  can_id: 'can-1',
  officer_id: 'officer-1',
  nominal: 125000,
  collected_at: '2026-11-11T08:30:00.000Z',
  period: '2026-11',
  sync_status: SyncStatus.COMPLETED,
  can: {
    qr_code: 'LAZ-QR-001',
    owner_name: 'Siti Aminah',
    owner_phone: '081234567890',
    owner_address: 'Dukuh Krajan',
  },
} as const;

const collectText = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return collectText((node as {props: {children?: unknown}}).props.children);
  }
  return '';
};

describe('CollectionHistoryDetailScreen', () => {
  it('shows can details, collection amount and time, and invokes correction for this collection', async () => {
    const onCorrect = jest.fn();
    const onBack = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <CollectionHistoryDetailScreen
          item={item as never}
          onBack={onBack}
          onCorrect={onCorrect}
        />,
      );
    });

    const text = tree.root
      .findAllByType(Text)
      .map(node => collectText(node.props.children))
      .join(' ');
    expect(text).toContain('Detail Penjemputan');
    expect(text).toContain('LAZ-QR-001');
    expect(text).toContain('Siti Aminah');
    expect(text).toContain('081234567890');
    expect(text).toContain('Nominal diterima');
    expect(text).toContain('125.000');
    expect(text).toContain('Waktu penjemputan');
    expect(text).toContain('2026');

    const correctionButton = tree.root
      .findAllByType(TouchableOpacity)
      .find(node => node.props.accessibilityLabel === 'Koreksi data penjemputan');
    expect(correctionButton).toBeDefined();
    const amountRow = tree.root.findByProps({testID: 'collection-amount-row'});
    expect(amountRow.findAllByType(TouchableOpacity)).toContain(correctionButton);
    act(() => correctionButton?.props.onPress());
    expect(onCorrect).toHaveBeenCalledWith(item);

    act(() => tree.unmount());
  });
});
