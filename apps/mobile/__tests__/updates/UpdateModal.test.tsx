import React from 'react';
import renderer, {act} from 'react-test-renderer';
import UpdateModal from '../../src/components/UpdateModal';
import {useUpdateStore} from '../../src/stores/useUpdateStore';

const baseRelease = {
  version: '1.1.1',
  version_code: 18,
  apk_url: 'https://apk.lazisnu.site/lazisnu-1.1.1.apk',
  apk_urls: {
    arm64_v8a: 'https://apk.lazisnu.site/lazisnu-1.1.1-arm64-v8a.apk',
    armeabi_v7a: 'https://apk.lazisnu.site/lazisnu-1.1.1-armeabi-v7a.apk',
    universal: 'https://apk.lazisnu.site/lazisnu-1.1.1.apk',
  },
  changelog: '- Label versi tampil\n- Modal pembaruan',
  minimum_version_code: 0,
};

const renderModal = async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<UpdateModal />);
  });
  return tree!;
};

/** Ratakan children bersarang (array/string/angka) menjadi satu string. */
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

describe('UpdateModal', () => {
  beforeEach(() => {
    useUpdateStore.setState({
      releaseInfo: baseRelease,
      modalVisible: true,
      forceUpdate: false,
      downloadState: 'idle',
      downloadProgress: 0,
      downloadError: null,
      apkPath: null,
      installAttempted: false,
    });
  });

  it('menampilkan judul, versi, dan isi changelog', async () => {
    const tree = await renderModal();
    const text = allText(tree);

    expect(text).toContain('Pembaruan Tersedia');
    expect(text).toContain('Versi 1.1.1');
    expect(text).toContain('Label versi tampil');
    expect(text).toContain('Modal pembaruan');
  });

  it('paksa-update: tidak ada tombol "Nanti"', async () => {
    useUpdateStore.setState({forceUpdate: true});
    const tree = await renderModal();
    const text = allText(tree);

    expect(text).toContain('Pembaruan Wajib');
    expect(text).not.toContain('Nanti');
  });

  it('bukan paksa-update: tombol "Nanti" dan "Unduh Pembaruan" hadir', async () => {
    const tree = await renderModal();
    const text = allText(tree);

    expect(text).toContain('Nanti');
    expect(text).toContain('Unduh Pembaruan');
  });

  it('sedang mengunduh: menampilkan progress', async () => {
    useUpdateStore.setState({downloadState: 'downloading', downloadProgress: 45});
    const tree = await renderModal();
    const text = allText(tree);

    expect(text).toContain('Mengunduh… 45%');
  });

  it('siap dipasang: tombol "Pasang Sekarang"', async () => {
    useUpdateStore.setState({downloadState: 'ready', apkPath: '/mock/x.apk'});
    const tree = await renderModal();
    const text = allText(tree);

    expect(text).toContain('Pasang Sekarang');
  });

  it('tanpa releaseInfo: tidak me-render apa pun', async () => {
    useUpdateStore.setState({releaseInfo: null});
    const tree = await renderModal();
    expect(tree.toJSON()).toBeNull();
  });
});
