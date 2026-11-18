import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Alert, Modal, Text, TextInput, TouchableOpacity} from 'react-native';
import CollectionScreen from '../../src/screens/CollectionScreen';
import {useCollectionStore} from '../../src/stores';
import {SegmentedControl} from '../../src/components/ui';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

const task = {
  id: '11111111-1111-4111-8111-111111111111',
  can_id: '22222222-2222-4222-8222-222222222222',
  qr_code: 'QR-COLLECTION-1',
  owner_name: 'Donatur Uji',
  owner_phone: '081234567890',
  owner_address: 'Dukuh Uji',
  status: 'ACTIVE' as const,
  assigned_at: '2026-11-01T00:00:00.000Z',
  period: '2026-11',
};

const findButton = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find(button => button.findAllByType(Text).some(text => text.props.children === label));
const flattenChildren = (children: React.ReactNode): string => {
  const parts = React.Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      return String(child);
    }
    if (React.isValidElement<{children?: React.ReactNode}>(child)) {
      return flattenChildren(child.props.children);
    }
    return '';
  });
  return parts.join('');
};

const renderedText = (view: renderer.ReactTestRenderer): string => {
  const nodes = view.root.findAllByType(Text);
  return nodes.map(node => flattenChildren(node.props.children)).join(' ');
};

describe('CollectionScreen konfirmasi kondisi', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  let submitSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;
  const navigation = {goBack: jest.fn(), navigate: jest.fn()};

  beforeEach(() => {
    jest.clearAllMocks();
    submitSpy = jest.spyOn(useCollectionStore.getState(), 'submitCollection').mockResolvedValue({
      success: true,
      synced: false,
    });
    alertSpy = jest.spyOn(Alert, 'alert');
  });

  afterEach(() => {
    if (tree) {
      act(() => tree?.unmount());
      tree = undefined;
    }
    submitSpy.mockRestore();
    alertSpy.mockRestore();
  });

  const renderScreen = async (subject = task) => {
    await act(async () => {
      tree = renderer.create(
        <CollectionScreen
          navigation={navigation as never}
          route={{params: {task: subject}} as never}
        />,
      );
    });
    return tree!;
  };

  const enterNominal = async (view: renderer.ReactTestRenderer, value: string) => {
    const input = view.root.findByType(TextInput);
    await act(async () => input.props.onChangeText(value));
    const button = findButton(view, 'Simpan Penjemputan');
    await act(async () => button?.props.onPress());
  };

  it('membuka modal konfirmasi dan belum mengirim; batal mempertahankan formulir', async () => {
    const view = await renderScreen();
    await enterNominal(view, '25000');

    expect(view.root.findByType(Modal).props.visible).toBe(true);
    expect(renderedText(view)).toContain('Baik dipilih sebagai asumsi awal');

    const cancel = findButton(view, 'Batal');
    await act(async () => cancel?.props.onPress());
    expect(view.root.findByType(Modal).props.visible).toBe(false);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(view.root.findByType(TextInput).props.value).toBe('25.000');
  });

  it('memakai kondisi observasi terakhir sebagai default, bukan asumsi lifecycle', async () => {
    const observedTask = {
      ...task,
      physical_condition: 'RUSAK' as const,
      physical_condition_source: 'OBSERVED' as const,
    };
    const view = await renderScreen(observedTask);
    // Picker kondisi kini hanya ada di modal konfirmasi.
    expect(view.root.findAllByType(SegmentedControl)).toHaveLength(0);

    await enterNominal(view, '25000');
    expect(renderedText(view)).toContain('Kondisi fisik terakhir tercatat: Rusak');
  });

  it('menolak Rp0 pada kunjungan Isi dan mengarahkan kembali ke pilihan Kosong', async () => {
    const visitTask = {...task, kind: 'VISIT' as const, is_visit_task: true};
    const view = await renderScreen(visitTask);
    await enterNominal(view, '0');

    expect(alertSpy).toHaveBeenCalledWith(
      'Nominal Belum Valid',
      expect.stringContaining('pilih tombol Kosong'),
      expect.any(Array),
    );
    expect(submitSpy).not.toHaveBeenCalled();
    expect(view.root.findByType(Modal).props.visible).toBe(false);
  });

  it('penjemputan biasa tetap meminta konfirmasi kosong untuk Rp0 sebelum kondisi', async () => {
    const view = await renderScreen();
    await enterNominal(view, '0');
    expect(alertSpy).toHaveBeenCalledWith(
      'Konfirmasi Kaleng Kosong',
      expect.any(String),
      expect.any(Array),
    );
    expect(view.root.findByType(Modal).props.visible).toBe(false);
    const buttons = alertSpy.mock.calls[0]?.[2] as {text: string; onPress?: () => void}[];
    await act(async () => buttons.find(button => button.text === 'Ya, Lanjutkan')?.onPress?.());
    expect(view.root.findByType(Modal).props.visible).toBe(true);

    const confirm = findButton(view, 'Konfirmasi & Simpan');
    await act(async () => confirm?.props.onPress());
    expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({nominal: 0}));
  });

  it('mengirim setelah konfirmasi kedua dengan nominal dan kondisi yang dipilih', async () => {
    const view = await renderScreen();
    await enterNominal(view, '25000');
    const confirm = findButton(view, 'Konfirmasi & Simpan');
    await act(async () => {
      confirm?.props.onPress();
      confirm?.props.onPress();
    });

    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({nominal: 25000, condition: 'AKTIF', physical_condition: 'BAIK'}),
    );
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
