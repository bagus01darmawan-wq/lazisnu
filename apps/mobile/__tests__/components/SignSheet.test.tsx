import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {SignSheet} from '../../src/components/SignSheet';

function renderSheet(props?: Partial<React.ComponentProps<typeof SignSheet>>) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SignSheet
        title="Tanda tangan PPK"
        submitLabel="Tanda Tangani"
        submitting={false}
        serverError={null}
        onSubmit={() => {}}
        onClose={() => {}}
        {...props}
      />,
    );
  });
  return tree!;
}

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

function textsOf(tree: renderer.ReactTestRenderer): string[] {
  // L1 (review-T10, dipertahankan saat resolusi merge T11): banding berbasis
  // isi props, bukan `node.type === 'Text'` (union host renderer tak overlap
  // string literal di tsc mobile) — digabung dengan collectText rekursif dari
  // fix CI typecheck agar anak bersarang tetap terbaca.
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

describe('C1-T10 SignSheet', () => {
  test('render judul + tombol + serverError tampil', () => {
    const tree = renderSheet({serverError: 'Setoran berubah'});
    const texts = textsOf(tree);
    expect(texts).toContain('Tanda tangan PPK');
    expect(texts).toContain('Tanda Tangani');
    expect(texts).toContain('Setoran berubah');
    expect(texts).toContain('Saya menyetujui berita acara ini');
  });

  test('tanpa coretan/consent tak ada pengiriman diam-diam', () => {
    const onSubmit = jest.fn();
    renderSheet({onSubmit});
    // Tanpa interaksi coretan, callback submit tak terpanggil.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('L3: consent lalu submit tanpa coretan → error lokal, onSubmit tetap diam', () => {
    const onSubmit = jest.fn();
    const tree = renderSheet({onSubmit});
    pressByLabel(tree, 'Persetujuan eksplisit tanda tangan');
    const {AppButton} =
      require('../../src/components/ui/AppButton') as typeof import('../../src/components/ui/AppButton');
    const buttons = tree.root.findAllByType(AppButton);
    // [Batal, Tanda Tangani] — tekan kirim tanpa coretan.
    act(() => {
      buttons[1]!.props.onPress();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textsOf(tree)).toContain('Coret tanda tangan dulu');
  });
});
