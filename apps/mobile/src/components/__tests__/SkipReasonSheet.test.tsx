import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {SkipReasonSheet, SKIP_REASON_OPTIONS} from '../ui/SkipReasonSheet';

/**
 * Helper: cari elemen tekan (TouchableOpacity di OptionList / AppButton) berdasarkan
 * label teksnya. Kembalikan handler onPress-nya.
 */
function pressableWithLabel(tree: renderer.ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType(require('react-native').TouchableOpacity).find(t => {
    const texts = t.findAllByType(require('react-native').Text);
    return texts.some(n => n.props.children === label);
  });
  return node;
}

describe('SkipReasonSheet — pemilih alasan "tidak terjemput"', () => {
  const baseProps = {
    visible: true,
    qrCode: 'LAZ-TEST-01',
    onDismiss: jest.fn(),
    onConfirm: jest.fn(),
  };

  const renderSheet = () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<SkipReasonSheet {...baseProps} />);
    });
    return tree!;
  };

  it('menampilkan 4 alasan baku saat dibuka', () => {
    const tree = renderSheet();
    const allText = tree.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');

    expect(SKIP_REASON_OPTIONS).toHaveLength(4);
    expect(allText).toContain('Pemilik tidak di tempat');
    expect(allText).toContain('Pemilik menolak dijemput');
    expect(allText).toContain('Akses ke lokasi sulit');
    expect(allText).toContain('Lainnya');
  });

  it('TOMBOL SIMPAN TERKUNCI sampai petugas pilih alasan (tidak boleh kosong)', () => {
    const tree = renderSheet();

    const simpan = pressableWithLabel(tree, 'Simpan');
    expect(simpan?.props?.disabled).toBe(true); // belum pilih alasan

    act(() => {
      simpan?.props?.onPress?.();
    });
    expect(baseProps.onConfirm).not.toHaveBeenCalled();

    // Setelah pilih "Akses ke lokasi sulit" → Simpan terbuka.
    const opsi = pressableWithLabel(tree, 'Akses ke lokasi sulit');
    act(() => {
      opsi?.props?.onPress?.();
    });

    const simpan2 = pressableWithLabel(tree, 'Simpan');
    expect(simpan2?.props?.disabled).toBe(false);
    act(() => {
      simpan2?.props?.onPress?.();
    });

    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfirm).toHaveBeenCalledWith('ACCESS_DIFFICULT', '');
  });

  it('mengirim catatan teks opsional bila diisi', () => {
    const tree = renderSheet();

    act(() => {
      pressableWithLabel(tree, 'Lainnya')?.props?.onPress?.();
    });

    const input = tree.root.findByType(require('react-native').TextInput);
    act(() => {
      input.props.onChangeText('Unit penyok parah');
    });

    act(() => {
      pressableWithLabel(tree, 'Simpan')?.props?.onPress?.();
    });

    expect(baseProps.onConfirm).toHaveBeenCalledWith('OTHER', 'Unit penyok parah');
  });

  it('Batal menutup tanpa mengirim', () => {
    const tree = renderSheet();

    act(() => {
      pressableWithLabel(tree, 'Lainnya')?.props?.onPress?.();
    });
    act(() => {
      pressableWithLabel(tree, 'Batal')?.props?.onPress?.();
    });

    expect(baseProps.onDismiss).toHaveBeenCalled();
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });

  it('hanya satu alasan terpilih (radio tunggal)', () => {
    const tree = renderSheet();

    act(() => {
      pressableWithLabel(tree, 'Akses ke lokasi sulit')?.props?.onPress?.();
    });
    act(() => {
      pressableWithLabel(tree, 'Pemilik tidak di tempat')?.props?.onPress?.();
    });
    act(() => {
      pressableWithLabel(tree, 'Simpan')?.props?.onPress?.();
    });

    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfirm).toHaveBeenLastCalledWith('OWNER_ABSENT', '');
  });
});
