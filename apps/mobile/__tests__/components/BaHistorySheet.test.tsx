import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {SignedPpkBaHistoryDto} from '../../src/services/api';
import {BaHistorySheet} from '../../src/components/BaHistorySheet';
import {AppButton} from '../../src/components/ui/AppButton';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: ({children}: {children?: unknown}) => ReactLib.createElement(View, null, children),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const ReactLib = require('react');
  const {Text} = require('react-native');
  return ({name}: {name: string}) => ReactLib.createElement(Text, null, name);
});

const history: SignedPpkBaHistoryDto[] = [
  {
    id: 'submission-oct',
    period: '2026-10',
    period_year: 2026,
    period_month: 10,
    ba_number: '010/BA/X/2026',
    finalized_at: '2026-11-02T00:00:00.000Z',
  },
  {
    id: 'submission-sep',
    period: '2026-09',
    period_year: 2026,
    period_month: 9,
    ba_number: '009/BA/IX/2026',
    finalized_at: '2026-10-02T00:00:00.000Z',
  },
];

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return collectText((node as {props: {children?: unknown}}).props.children);
  }
  return '';
}

describe('BaHistorySheet', () => {
  test('menampilkan satu tombol per BA dengan label periode dan ID yang sesuai', () => {
    const onDownload = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <BaHistorySheet
          visible
          history={history}
          loading={false}
          error={null}
          busyId={null}
          downloadError={null}
          onDownload={onDownload}
          onRetry={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const buttons = tree.root
      .findAllByType(AppButton)
      .filter(node =>
        ['Unduh BA Oktober 2026', 'Unduh BA September 2026'].includes(node.props.label),
      );
    expect(buttons).toHaveLength(2);
    act(() => (buttons[1]!.props as {onPress: () => void}).onPress());
    expect(onDownload).toHaveBeenCalledWith('submission-sep');
  });

  test('menjelaskan ketika belum ada BA yang ditandatangani', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <BaHistorySheet
          visible
          history={[]}
          loading={false}
          error={null}
          busyId={null}
          downloadError={null}
          onDownload={jest.fn()}
          onRetry={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });
    const texts = tree.root
      .findAll(node => (node as {type?: unknown}).type === 'Text')
      .map(node => collectText((node.props as {children?: unknown}).children));
    expect(texts).toContain('Belum ada berita acara yang ditandatangani lengkap.');
  });
});
