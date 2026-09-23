import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Alert, Linking} from 'react-native';

/**
 * Bagian "Berita Acara" di halaman Profil.
 *
 * Yang dikunci di sini adalah aturan yang diminta Pion (23 Sep 2026):
 * **tombol Unduh PDF baru muncul setelah Generate selesai** — dan "selesai"
 * berarti server sudah menyimpan berkasnya (`pdf_url` terisi), bukan sekadar
 * permintaan HTTP-nya berbalas.
 */

const mockGetBranchSubmissions = jest.fn();
const mockGenerateBranchBaPdf = jest.fn();
const mockGetBranchBaPdf = jest.fn();

/** Diubah per-tes untuk menguji gerbang peran. */
let mockCurrentRole = 'ADMIN_RANTING';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));

jest.mock('react-native-linear-gradient', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return ({children, ...props}: {children?: unknown}) =>
    ReactLib.createElement(View, props, children);
});

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const ReactLib = require('react');
  const {Text} = require('react-native');
  return ({name}: {name: string}) => ReactLib.createElement(Text, null, name);
});

jest.mock('../../src/services/biometric', () => ({
  isBiometricAvailable: jest.fn().mockResolvedValue(false),
  getBiometryType: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/stores', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: {
        id: 'u-1',
        full_name: 'Bendahara Uji',
        phone: '081234567890',
        role: mockCurrentRole,
        is_active: true,
      },
      logout: jest.fn(),
      biometricEnabled: false,
      enableBiometric: jest.fn(),
      disableBiometric: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
  useTasksStore: () => ({activeCount: 0, completePeriod: jest.fn()}),
  useUpdateStore: (selector?: (state: unknown) => unknown) => {
    const state = {checkManually: jest.fn()};
    return selector ? selector(state) : state;
  },
}));

jest.mock('../../src/services/api', () => ({
  __esModule: true,
  c1Service: {
    getBranchSubmissions: (...args: unknown[]) => mockGetBranchSubmissions(...args),
    generateBranchBaPdf: (...args: unknown[]) => mockGenerateBranchBaPdf(...args),
    getBranchBaPdf: (...args: unknown[]) => mockGetBranchBaPdf(...args),
  },
}));

import ProfileScreen from '../../src/screens/ProfileScreen';

const rowFinal = {
  id: 'sub-1',
  branch_id: 'br-1',
  branch_name: 'Ranting Uji',
  period: '2026-09',
  total_amount: 50000,
  bisyaroh_total: 5000,
  share_mwc: 13500,
  net_amount: 31500,
  status: 'FINAL',
  version: 1,
  pdf_url: null as string | null,
  ba_number: '001/BA/IX/2026',
};

const rowDraft = {...rowFinal, status: 'DRAFT'};

async function renderScreen() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProfileScreen />);
  });
  return tree!;
}

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join('');
  }
  if (node && typeof node === 'object' && 'props' in (node as {props?: unknown})) {
    return collectText((node as {props: {children?: unknown}}).props?.children);
  }
  return '';
}

function textsOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => {
      const t = (node as {type?: unknown}).type;
      return (
        typeof t === 'string' ||
        (typeof t === 'function' && (t as {displayName?: string}).displayName === 'Text')
      );
    })
    .map(node => collectText((node.props as {children?: unknown}).children));
}

function labelsOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(
      node =>
        typeof (node.props as {accessibilityLabel?: unknown})?.accessibilityLabel === 'string',
    )
    .map(node => (node.props as {accessibilityLabel: string}).accessibilityLabel);
}

function pressByLabel(tree: renderer.ReactTestRenderer, label: string): void {
  const target = tree.root.findAll(
    node => (node.props as {accessibilityLabel?: unknown} | null)?.accessibilityLabel === label,
    {deep: true},
  )[0];
  if (!target) throw new Error(`tombol "${label}" tak ditemukan`);
  act(() => {
    (target.props as {onPress: () => void}).onPress();
  });
}

describe('Halaman Profil — bagian Berita Acara', () => {
  beforeEach(() => {
    mockCurrentRole = 'ADMIN_RANTING';
    mockGetBranchSubmissions.mockReset();
    mockGenerateBranchBaPdf.mockReset();
    mockGetBranchBaPdf.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('BA sudah FINAL tanpa berkas: Generate ada, Unduh belum muncul', async () => {
    mockGetBranchSubmissions.mockResolvedValue({success: true, data: [rowFinal]});
    const tree = await renderScreen();
    const labels = labelsOf(tree);
    expect(labels).toContain('Generate PDF');
    expect(labels).not.toContain('Unduh PDF');
    expect(textsOf(tree)).toContain('Ranting Uji');
  });

  test('Generate selesai → daftar dimuat ulang → tombol Unduh muncul', async () => {
    // Muat pertama: belum ada berkas. Muat kedua: server sudah menyimpannya.
    mockGetBranchSubmissions
      .mockResolvedValueOnce({success: true, data: [rowFinal]})
      .mockResolvedValue({
        success: true,
        data: [{...rowFinal, pdf_url: 'ba-pdfs/branch/sub-1-v1.pdf'}],
      });
    mockGenerateBranchBaPdf.mockResolvedValue({
      success: true,
      data: {pdf_hash: 'a'.repeat(64), version: 1, reused: false},
    });

    const tree = await renderScreen();
    expect(labelsOf(tree)).not.toContain('Unduh PDF');

    await act(async () => {
      pressByLabel(tree, 'Generate PDF');
    });

    expect(mockGenerateBranchBaPdf).toHaveBeenCalledWith('sub-1');
    expect(labelsOf(tree)).toContain('Unduh PDF');
  });

  test('Unduh mengambil tautan baru lalu membukanya (bukan tautan lama)', async () => {
    mockGetBranchSubmissions.mockResolvedValue({
      success: true,
      data: [{...rowFinal, pdf_url: 'ba-pdfs/branch/sub-1-v1.pdf'}],
    });
    mockGetBranchBaPdf.mockResolvedValue({
      success: true,
      data: {
        download_url: 'https://signed.test/ba.pdf',
        expires_in_seconds: 600,
        pdf_hash: 'b'.repeat(64),
        reused: true,
      },
    });

    const tree = await renderScreen();
    await act(async () => {
      pressByLabel(tree, 'Unduh PDF');
    });

    expect(mockGetBranchBaPdf).toHaveBeenCalledWith('sub-1');
    expect(Linking.openURL).toHaveBeenCalledWith('https://signed.test/ba.pdf');
  });

  test('BA belum FINAL: tak ditawarkan diterbitkan, alasannya dijelaskan', async () => {
    mockGetBranchSubmissions.mockResolvedValue({success: true, data: [rowDraft]});
    const tree = await renderScreen();
    expect(labelsOf(tree)).not.toContain('Generate PDF');
    expect(textsOf(tree).join(' ')).toContain('Belum sah');
  });

  test('peran tanpa hak (PPK) tidak melihat bagian ini dan tidak memanggil API', async () => {
    mockCurrentRole = 'PETUGAS';
    mockGetBranchSubmissions.mockResolvedValue({success: true, data: [rowFinal]});
    const tree = await renderScreen();
    expect(labelsOf(tree)).not.toContain('Generate PDF');
    expect(mockGetBranchSubmissions).not.toHaveBeenCalled();
  });
});
