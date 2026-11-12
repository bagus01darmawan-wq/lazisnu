import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Linking} from 'react-native';

const mockGetMySubmission = jest.fn();
const mockGetPeriodInfo = jest.fn();
const mockGetSignedBaHistory = jest.fn();
const mockGetBeritaAcara = jest.fn();
const mockGetPdf = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaView: ({children}: {children?: unknown}) =>
      ReactLib.createElement(View, null, children),
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: ({children}: {children?: unknown}) => ReactLib.createElement(View, null, children),
  };
});
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const ReactLib = require('react');
  const {Text: NativeText} = require('react-native');
  return ({name}: {name: string}) => ReactLib.createElement(NativeText, null, name);
});
jest.mock('../../src/stores', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({user: {role: 'PETUGAS'}}),
  usePeriodStore: (selector: (state: unknown) => unknown) =>
    selector({
      context: {display_period: {year: 2026, month: 11}},
      refresh: jest.fn().mockResolvedValue(undefined),
    }),
}));
jest.mock('../../src/services/api', () => ({
  __esModule: true,
  c1Service: {
    getMySubmission: (...args: unknown[]) => mockGetMySubmission(...args),
    getPeriodInfo: (...args: unknown[]) => mockGetPeriodInfo(...args),
    getSignedBaHistory: (...args: unknown[]) => mockGetSignedBaHistory(...args),
    getBeritaAcara: (...args: unknown[]) => mockGetBeritaAcara(...args),
    getPdf: (...args: unknown[]) => mockGetPdf(...args),
    signSubmission: jest.fn(),
  },
}));
jest.mock('../../src/components/ui/AppHeader', () => ({AppHeader: () => null}));
jest.mock('../../src/components/PeriodChip', () => ({PeriodChip: () => null}));
jest.mock('../../src/components/ui/StatusBadge', () => ({
  StatusBadge: ({label}: {label: string}) => {
    const ReactLib = require('react');
    const {Text: NativeText} = require('react-native');
    return ReactLib.createElement(NativeText, null, label);
  },
}));
jest.mock('../../src/components/SignSheet', () => ({SignSheet: () => null}));
jest.mock('../../src/components/BaPreviewSheet', () => ({BaPreviewSheet: () => null}));

import SetoranScreen from '../../src/screens/SetoranScreen';
import {AppButton} from '../../src/components/ui/AppButton';

const signedHistory = [
  {
    id: 'ba-october',
    period: '2026-10',
    period_year: 2026,
    period_month: 10,
    ba_number: '010/BA/X/2026',
    finalized_at: '2026-11-02T00:00:00.000Z',
  },
  {
    id: 'ba-september',
    period: '2026-09',
    period_year: 2026,
    period_month: 9,
    ba_number: '009/BA/IX/2026',
    finalized_at: '2026-10-02T00:00:00.000Z',
  },
];

let mountedTree: renderer.ReactTestRenderer | undefined;

function findByLabel(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => (node.props as {accessibilityLabel?: unknown}).accessibilityLabel === label,
  )[0];
}

async function renderScreen() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SetoranScreen />);
  });
  mountedTree = tree;
  return tree;
}

describe('SetoranScreen — riwayat BA lintas periode', () => {
  beforeEach(() => {
    mockGetMySubmission.mockResolvedValue({
      success: true,
      data: {
        id: 'current-november',
        officer_id: 'officer-1',
        branch_id: 'branch-1',
        period: '2026-11',
        period_year: 2026,
        period_month: 11,
        total_amount: 0,
        collection_count: 0,
        bisyaroh_amount: 0,
        net_amount: 0,
        status: 'DRAFT',
        version: 1,
        ppk_signer_id: null,
        bendahara_signer_id: null,
      },
    });
    mockGetPeriodInfo.mockResolvedValue({success: true, data: null});
    mockGetSignedBaHistory.mockResolvedValue({success: true, data: signedHistory});
    mockGetBeritaAcara.mockResolvedValue({
      success: true,
      data: {title: 'BA November', table: [], statements: []},
    });
    mockGetPdf.mockResolvedValue({
      success: true,
      data: {download_url: 'https://signed.test/october.pdf'},
    });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  afterEach(() => {
    if (mountedTree) {
      act(() => mountedTree?.unmount());
      mountedTree = undefined;
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('kartu membuka pilihan periode dan unduh memakai submission yang dipilih, bukan periode aktif', async () => {
    const tree = await renderScreen();
    const card = findByLabel(tree, 'Buka riwayat berita acara yang sudah ditandatangani');
    expect(card).toBeDefined();
    act(() => (card!.props as {onPress: () => void}).onPress());

    const octoberButton = tree.root
      .findAllByType(AppButton)
      .find(button => button.props.label === 'Unduh BA Oktober 2026');
    const septemberButton = tree.root
      .findAllByType(AppButton)
      .find(button => button.props.label === 'Unduh BA September 2026');
    expect(octoberButton).toBeDefined();
    expect(septemberButton).toBeDefined();

    await act(async () => {
      septemberButton!.props.onPress();
    });
    expect(mockGetPdf).toHaveBeenCalledWith('ba-september');
    expect(Linking.openURL).toHaveBeenCalledWith('https://signed.test/october.pdf');
  });
});
