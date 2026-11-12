import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {HistoryItem} from '../../src/screens/history/HistoryItem';
import {AppCard} from '../../src/components/ui';
import {Spacing} from '../../src/theme';
import {CanCondition, SyncStatus} from '@lazisnu/shared-types';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => () => null);
jest.mock('react-native-reanimated', () => {
  const MockReact = require('react');
  const {View} = require('react-native');
  const AnimatedView = ({children, ...props}: {children?: React.ReactNode}) =>
    MockReact.createElement(View, {...props, testID: 'animated-history-wrapper'}, children);
  return {
    __esModule: true,
    default: {View: AnimatedView},
    FadeInUp: {delay: () => ({duration: () => 'entering-animation'})},
    Layout: {springify: () => 'layout-animation'},
  };
});

const item = {
  id: 'collection-1',
  assignment_id: 'assignment-1',
  can_id: 'can-1',
  officer_id: 'officer-1',
  nominal: 125000,
  collected_at: '2026-11-11T08:30:00.000Z',
  period: '2026-11',
  sync_status: SyncStatus.COMPLETED,
  condition: CanCondition.HILANG,
  can: {
    qr_code: 'LAZ-QR-001',
    owner_name: 'Siti Aminah',
    owner_address: 'Dukuh Krajan',
    dukuh_name: 'Krajan',
    rt: '001',
    rw: '002',
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

describe('HistoryItem', () => {
  it('opens details when tapped and hides amount and correction from the list card', () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryItem item={item as never} index={0} onPress={onPress} />);
    });

    const text = tree.root
      .findAllByType(Text)
      .map(node => collectText(node.props.children))
      .join(' ');
    expect(text).not.toContain('125.000');
    expect(text).not.toContain('Koreksi');

    const openDetails = tree.root
      .findAllByType(TouchableOpacity)
      .find(node => node.props.accessibilityLabel === 'Buka detail penjemputan Siti Aminah');
    expect(openDetails).toBeDefined();

    act(() => openDetails?.props.onPress());
    expect(onPress).toHaveBeenCalledWith(item);

    act(() => tree.unmount());
  });

  it('orders owner, RT/RW and dukuh and stacks the condition chip above sync status', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryItem item={item as never} index={0} onPress={jest.fn()} />);
    });

    const labels = tree.root.findAllByType(Text).map(node => collectText(node.props.children));
    const ownerIndex = labels.indexOf('Siti Aminah');
    const rtRwIndex = labels.indexOf('RT 001 / RW 002');
    const dukuhIndex = labels.indexOf('Krajan');
    expect(ownerIndex).toBeGreaterThanOrEqual(0);
    expect(rtRwIndex).toBeGreaterThan(ownerIndex);
    expect(dukuhIndex).toBeGreaterThan(rtRwIndex);
    expect(labels).toContain('Hilang');

    const statusStack = tree.root.findByProps({testID: 'condition-status-stack'});
    const statusElements = Array.from(
      new Set(
        statusStack
          .findAll(
            node =>
              node.props.testID === 'condition-chip' || node.props.testID === 'sync-status-icon',
          )
          .map(node => node.props.testID),
      ),
    );
    expect(statusElements).toEqual(['condition-chip', 'sync-status-icon']);

    act(() => tree.unmount());
  });

  it('renders without entry or layout animation', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryItem item={item as never} index={0} onPress={jest.fn()} />);
    });

    expect(tree.root.findAllByProps({testID: 'animated-history-wrapper'})).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('uses the compact spacing of the visit-history cards', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryItem item={item as never} index={0} onPress={jest.fn()} />);
    });

    const card = tree.root.findByType(AppCard);
    expect(StyleSheet.flatten(card.props.style).marginBottom).toBe(Spacing.sm);
    act(() => tree.unmount());
  });

  it('keeps the failure-detail action available on failed collections', () => {
    const onViewFailureDetail = jest.fn();
    const failedItem = {...item, sync_status: SyncStatus.FAILED};
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HistoryItem
          item={failedItem as never}
          index={0}
          onPress={jest.fn()}
          onViewFailureDetail={onViewFailureDetail}
        />,
      );
    });

    const failureButton = tree.root
      .findAllByType(TouchableOpacity)
      .find(node => node.props.accessibilityLabel === 'Lihat detail kegagalan');
    expect(failureButton).toBeDefined();
    act(() => failureButton?.props.onPress());
    expect(onViewFailureDetail).toHaveBeenCalledWith(failedItem);

    act(() => tree.unmount());
  });
});
