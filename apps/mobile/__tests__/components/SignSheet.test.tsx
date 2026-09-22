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

function textsOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string' && node.type === 'Text')
    .flatMap(node =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter((c): c is string => typeof c === 'string');
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
});
