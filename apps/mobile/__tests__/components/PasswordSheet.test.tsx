import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';

/**
 * Sheet "Buat/Ubah Kata Sandi" di halaman Profil.
 *
 * Yang dikunci: judul bergantung pada status (belum pernah vs sudah pernah
 * membuat sandi), OTP wajib diminta dulu sebelum form aktif, dan Simpan
 * memanggil setPassword dengan OTP + sandi apa adanya (tanpa syarat karakter
 * — kebijakan 2026-10-27).
 */

const mockRequestOTP = jest.fn();
const mockSetPassword = jest.fn();

jest.mock('../../src/services/api', () => ({
  __esModule: true,
  authService: {
    requestOTP: (...args: unknown[]) => mockRequestOTP(...args),
    setPassword: (...args: unknown[]) => mockSetPassword(...args),
  },
}));

import {PasswordSheet} from '../../src/components/PasswordSheet';

const baseProps = {
  visible: true,
  phone: '628123456789',
  passwordSet: false,
  onDismiss: jest.fn(),
  onSaved: jest.fn(),
};

let mountedTree: renderer.ReactTestRenderer | undefined;

function pressableWithText(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAllByType(require('react-native').TouchableOpacity).find(t => {
    const texts = t.findAllByType(require('react-native').Text);
    return texts.some(n => String(n.props.children) === label);
  });
}

function textInputs(tree: renderer.ReactTestRenderer) {
  return tree.root.findAllByType(TextInput);
}

async function renderSheet(overrides: Partial<typeof baseProps> = {}) {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<PasswordSheet {...baseProps} {...overrides} />);
  });
  mountedTree = tree;
  return tree;
}

describe('PasswordSheet — buat/ubah kata sandi via OTP', () => {
  beforeEach(() => {
    mockRequestOTP.mockReset();
    mockSetPassword.mockReset();
    baseProps.onDismiss.mockReset();
    baseProps.onSaved.mockReset();
  });

  afterEach(() => {
    if (mountedTree) {
      act(() => mountedTree?.unmount());
      mountedTree = undefined;
    }
  });

  it('judul dan status mengikuti passwordSet', async () => {
    const belum = await renderSheet();
    const teksBelum = belum.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');
    expect(teksBelum).toContain('Buat Kata Sandi');
    expect(teksBelum).not.toContain('Ubah Kata Sandi');
    await act(async () => mountedTree?.unmount());

    const sudah = await renderSheet({passwordSet: true});
    const teksSudah = sudah.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');
    expect(teksSudah).toContain('Ubah Kata Sandi');
  });

  it('form terkunci sampai kode OTP terkirim, lalu terbuka', async () => {
    mockRequestOTP.mockResolvedValue({success: true, data: {message: 'x', expires_in: 300}});
    const tree = await renderSheet();

    // Sebelum kirim: input OTP & sandi nonaktif, Simpan terkunci.
    const inputsSebelum = textInputs(tree);
    expect(inputsSebelum.length).toBeGreaterThanOrEqual(2);
    expect(inputsSebelum.every(i => i.props.editable === false)).toBe(true);
    const simpan = pressableWithText(tree, 'Simpan');
    expect(simpan?.props?.disabled).toBe(true);

    await act(async () => {
      pressableWithText(tree, 'Kirim Kode OTP')?.props?.onPress?.();
    });

    expect(mockRequestOTP).toHaveBeenCalledWith('628123456789');
    const inputs = textInputs(tree);
    expect(inputs.every(i => i.props.editable !== false)).toBe(true);
    const teks = tree.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');
    expect(teks).toContain('Kode terkirim');
    expect(teks).toContain('628****789');
  });

  it('Simpan memanggil setPassword dengan OTP + sandi, lalu onSaved', async () => {
    mockRequestOTP.mockResolvedValue({success: true, data: {message: 'x', expires_in: 300}});
    mockSetPassword.mockResolvedValue({
      success: true,
      data: {message: 'ok', password_set_at: '2026-10-27T00:00:00Z'},
    });
    const tree = await renderSheet();

    await act(async () => {
      pressableWithText(tree, 'Kirim Kode OTP')?.props?.onPress?.();
    });

    const [otpInput, passwordInput, confirmInput] = textInputs(tree);
    if (!otpInput || !passwordInput || !confirmInput) {
      throw new Error('input OTP, sandi, dan konfirmasi tidak ditemukan');
    }
    await act(async () => {
      otpInput.props.onChangeText('123456');
    });
    await act(async () => {
      passwordInput.props.onChangeText('sandi-bebas-apa-saja');
    });
    await act(async () => {
      confirmInput.props.onChangeText('sandi-bebas-apa-saja');
    });

    await act(async () => {
      pressableWithText(tree, 'Simpan')?.props?.onPress?.();
    });

    expect(mockSetPassword).toHaveBeenCalledWith('628123456789', '123456', 'sandi-bebas-apa-saja');
    expect(baseProps.onSaved).toHaveBeenCalledTimes(1);
    expect(baseProps.onDismiss).not.toHaveBeenCalled();
  });

  it('OTP salah: pesan server tampil, sheet tetap terbuka', async () => {
    mockRequestOTP.mockResolvedValue({success: true, data: {message: 'x', expires_in: 300}});
    mockSetPassword.mockResolvedValue({
      success: false,
      error: {code: 'INVALID_OTP', message: 'OTP tidak valid atau sudah expired'},
    });
    const tree = await renderSheet();

    await act(async () => {
      pressableWithText(tree, 'Kirim Kode OTP')?.props?.onPress?.();
    });
    const [otpInput, passwordInput, confirmInput] = textInputs(tree);
    if (!otpInput || !passwordInput || !confirmInput) {
      throw new Error('input OTP, sandi, dan konfirmasi tidak ditemukan');
    }
    await act(async () => {
      otpInput.props.onChangeText('999999');
    });
    await act(async () => {
      passwordInput.props.onChangeText('x');
    });
    await act(async () => {
      confirmInput.props.onChangeText('x');
    });
    await act(async () => {
      pressableWithText(tree, 'Simpan')?.props?.onPress?.();
    });

    const teks = tree.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');
    expect(teks).toContain('OTP tidak valid atau sudah expired');
    expect(baseProps.onSaved).not.toHaveBeenCalled();
  });

  it('menolak menyimpan saat OTP belum 6 digit', async () => {
    mockRequestOTP.mockResolvedValue({success: true, data: {message: 'x', expires_in: 300}});
    const tree = await renderSheet();

    await act(async () => {
      pressableWithText(tree, 'Kirim Kode OTP')?.props?.onPress?.();
    });
    const [otpInput, passwordInput, confirmInput] = textInputs(tree);
    if (!otpInput || !passwordInput || !confirmInput) {
      throw new Error('input OTP, sandi, dan konfirmasi tidak ditemukan');
    }
    await act(async () => {
      otpInput.props.onChangeText('123');
    });
    await act(async () => {
      passwordInput.props.onChangeText('x');
    });
    await act(async () => {
      confirmInput.props.onChangeText('x');
    });

    expect(pressableWithText(tree, 'Simpan')?.props?.disabled).toBe(true);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it('menolak menyimpan saat konfirmasi sandi tidak sama', async () => {
    mockRequestOTP.mockResolvedValue({success: true, data: {message: 'x', expires_in: 300}});
    const tree = await renderSheet();

    await act(async () => {
      pressableWithText(tree, 'Kirim Kode OTP')?.props?.onPress?.();
    });
    const [otpInput, passwordInput, confirmInput] = textInputs(tree);
    if (!otpInput || !passwordInput || !confirmInput) {
      throw new Error('input OTP, sandi, dan konfirmasi tidak ditemukan');
    }
    await act(async () => {
      otpInput.props.onChangeText('123456');
    });
    await act(async () => {
      passwordInput.props.onChangeText('admin123');
    });
    await act(async () => {
      confirmInput.props.onChangeText('admin124');
    });

    expect(pressableWithText(tree, 'Simpan')?.props?.disabled).toBe(true);
    const teks = tree.root
      .findAllByType(require('react-native').Text)
      .map(n => String(n.props.children))
      .join(' ');
    expect(teks).toContain('Kata sandi belum sama');
    expect(mockSetPassword).not.toHaveBeenCalled();
  });
});
