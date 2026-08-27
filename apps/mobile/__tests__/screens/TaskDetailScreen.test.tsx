import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import TaskDetailScreen from '../../src/screens/TaskDetailScreen';
import {useTasksStore} from '../../src/stores';

const mockTask = {
  id: 'task-1',
  qr_code: 'LZS-PT-2026-0842',
  owner_name: 'H. Ahmad Fauzi',
  owner_phone: '081234567890',
  owner_address: 'Dukuh Krajan, Paninggaran',
  period: 'Juli 2026',
  status: 'ACTIVE',
  last_collection: {nominal: 150000},
};

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
    useRoute: () => ({params: {task: mockTask}}),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

/** Ratakan children bersarang menjadi satu string. */
const collectText = (node: unknown): string => {
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
};

const allText = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(require('react-native').Text)
    .map(n => collectText(n.props.children))
    .join(' ');

/** Cari elemen tekan terdekat (ancestor yang punya onPress). */
const findPressable = (node: unknown): {props?: {onPress?: () => void}} | undefined => {
  let current: unknown = node;

  let cur = current as any;
  while (cur) {
    if (typeof cur.props?.onPress === 'function') {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
};

describe('TaskDetailScreen — detail penjemputan dari kartu tugas', () => {
  let skipSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    skipSpy = jest
      .spyOn(useTasksStore.getState(), 'skipAssignment')
      .mockResolvedValue({success: true} as never);
    fetchSpy = jest
      .spyOn(useTasksStore.getState(), 'fetchTasks')
      .mockResolvedValue(undefined as never);
    alertSpy = jest.spyOn(Alert, 'alert');
  });

  afterEach(() => {
    skipSpy.mockRestore();
    fetchSpy.mockRestore();
    alertSpy.mockRestore();
  });

  const renderScreen = async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<TaskDetailScreen />);
    });
    return tree!;
  };

  it('menampilkan judul Detail Penjemputan + baris info lengkap (termasuk Periode)', async () => {
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).toContain('Detail Penjemputan');
    expect(text).toContain('Kode QR');
    expect(text).toContain('LZS-PT-2026-0842');
    expect(text).toContain('Nama Pemilik');
    expect(text).toContain('H. Ahmad Fauzi');
    expect(text).toContain('Nomor HP');
    expect(text).toContain('081234567890');
    expect(text).toContain('Alamat');
    expect(text).toContain('Dukuh Krajan, Paninggaran');
    expect(text).toContain('Periode');
    expect(text).toContain('Penjemputan Terakhir');
    expect(text).toContain('Tidak Dijemput');
    expect(text).toContain('Lanjutkan');
  });

  it('TIDAK menampilkan teks & ikon sukses alur scan (QR Code Terdeteksi!)', async () => {
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).not.toContain('QR Code Terdeteksi!');
  });

  it('menekan Lanjutkan → membuka halaman Collection dengan tugas ini', async () => {
    const tree = await renderScreen();
    const lanjutkan = tree.root
      .findAllByType(require('react-native').Text)
      .find(n => collectText(n.props.children) === 'Lanjutkan');
    const pressable = findPressable(lanjutkan);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Collection', {task: mockTask});
  });

  it('menekan Tidak Dijemput → konfirmasi → skipAssignment + kembali + daftar disegarkan', async () => {
    const tree = await renderScreen();
    const labelNode = tree.root
      .findAllByType(require('react-native').Text)
      .find(n => collectText(n.props.children) === 'Tidak Dijemput');
    const pressable = findPressable(labelNode);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Tandai Tidak Dijemput',
      expect.any(String),
      expect.any(Array),
    );

    // Pilih konfirmasi "Ya, Tandai"
    const buttons = alertSpy.mock.calls[0][2] as Array<{text: string; onPress?: () => void}>;
    const confirm = buttons.find(b => b.text === 'Ya, Tandai');
    expect(confirm).toBeDefined();

    await act(async () => {
      await confirm?.onPress?.();
    });

    expect(skipSpy).toHaveBeenCalledWith('task-1');
    expect(fetchSpy).toHaveBeenCalledWith('ACTIVE');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('skip gagal → menampilkan alasan asli (bukan tuduhan koneksi internet)', async () => {
    skipSpy.mockResolvedValueOnce({
      success: false,
      code: 'ALREADY_SUBMITTED',
      error: 'Kaleng ini sudah disetor pada periode berjalan.',
    } as never);

    const tree = await renderScreen();
    const labelNode = tree.root
      .findAllByType(require('react-native').Text)
      .find(n => collectText(n.props.children) === 'Tidak Dijemput');
    const pressable = findPressable(labelNode);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    const buttons = alertSpy.mock.calls[0][2] as Array<{text: string; onPress?: () => void}>;
    const confirm = buttons.find(b => b.text === 'Ya, Tandai');
    expect(confirm).toBeDefined();

    await act(async () => {
      await confirm?.onPress?.();
    });

    expect(alertSpy).toHaveBeenLastCalledWith(
      'Gagal Menandai',
      'Kaleng ini sudah disetor pada periode berjalan.',
    );
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
