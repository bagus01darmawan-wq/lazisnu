import React from 'react';
import renderer, {act} from 'react-test-renderer';

// Modal native tidak dirender oleh test-renderer — ganti dengan komponen
// yang langsung merender children agar isi sheet dapat diuji.
// Proxy (bukan spread) agar properti lain tetap lazy seperti require normal.
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'Modal') {
        return ({children}: {children: React.ReactNode}) => children;
      }
      if (prop === 'FlatList') {
        // Shim uji: merender SEMUA baris. Virtualization adalah perilaku RN
        // (butuh onLayout/ukuran yang tak ada di react-test-renderer); yang
        // kita uji = model baris komponen (slice 50 + catatan sisa).
        const ReactModule = require('react');
        return function TestFlatList(props: {
          data: unknown[];
          renderItem: (info: {item: unknown; index: number}) => React.ReactNode;
          keyExtractor?: (item: unknown, index: number) => string;
        }) {
          const {data, renderItem, keyExtractor} = props;
          return ReactModule.createElement(
            ReactModule.Fragment,
            null,
            data.map((item, index) =>
              ReactModule.createElement(
                ReactModule.Fragment,
                {key: keyExtractor ? keyExtractor(item, index) : String(index)},
                renderItem({item, index}),
              ),
            ),
          );
        };
      }
      return target[prop];
    },
  });
});

import {SyncIssuesSheet} from '../../src/components/SyncIssuesSheet';

const mockTriggerSync = jest.fn();
const mockRetryFailed = jest.fn();
const mockRemoveFailedCorr = jest.fn();
const mockCollectionQueue = jest.fn();
const mockFailedQueue = jest.fn();
const mockCorrQueue = jest.fn();
const mockCorrFailed = jest.fn();
const mockTaskCache = jest.fn();
const mockCollectionsCache = jest.fn();

jest.mock('../../src/services/offline/queue', () => ({
  offlineQueue: {
    getQueue: () => mockCollectionQueue(),
    getFailedPermanent: () => mockFailedQueue(),
  },
}));

jest.mock('../../src/services/offline/corrections', () => ({
  correctionQueue: {
    getQueue: () => mockCorrQueue(),
    getFailedPermanent: () => mockCorrFailed(),
    removeFromFailedPermanent: (ids: string[]) => mockRemoveFailedCorr(ids),
  },
}));

jest.mock('../../src/services/offline/tasks', () => ({
  taskCache: {getTasks: () => mockTaskCache()},
}));

jest.mock('../../src/services/offline/cache', () => ({
  collectionsCache: {get: () => mockCollectionsCache()},
}));

jest.mock('../../src/stores', () => ({
  useSyncStore: {getState: () => ({triggerSync: mockTriggerSync})},
  useCollectionsStore: {getState: () => ({retryFailedCollection: mockRetryFailed})},
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
  let cur = node as any;
  while (cur) {
    if (typeof cur.props?.onPress === 'function') {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
};

const findText = (tree: renderer.ReactTestRenderer, text: string) =>
  tree.root
    .findAllByType(require('react-native').Text)
    .find(n => collectText(n.props.children) === text);

beforeEach(() => {
  jest.clearAllMocks();
  mockCollectionQueue.mockReturnValue([
    {
      offline_id: 'o1',
      assignment_id: 'a1',
      can_id: 'c1',
      nominal: 150000,
      collected_at: '2026-08-28T08:00:00.000Z',
      retry_attempts: 0,
    },
  ]);
  mockFailedQueue.mockReturnValue([
    {
      offline_id: 'o2',
      assignment_id: 'a2',
      can_id: 'c2',
      nominal: 75000,
      collected_at: '2026-08-27T08:00:00.000Z',
      error_message: 'Kaleng ini sudah pernah di-submit untuk assignment ini',
      can_retry: false,
      error_type: 'VALIDATION',
    },
  ]);
  mockCorrQueue.mockReturnValue([]);
  mockCorrFailed.mockReturnValue([
    {
      correction_id: 'x1',
      collection_id: 'col1',
      nominal_lama: 100000,
      nominal_baru: 125000,
      alasan_resubmit: 'salah input',
      created_at: '2026-08-26T08:00:00.000Z',
      error_message: 'Hanya record terbaru yang bisa di-resubmit',
    },
  ]);
  mockTaskCache.mockReturnValue([
    {id: 'a1', qr_code: 'LZS-PT-2026-0842', owner_name: 'H. Ahmad Fauzi'},
    {id: 'a2', qr_code: 'LZS-PT-2026-0901', owner_name: 'Ibu Siti Aminah'},
  ]);
  mockCollectionsCache.mockReturnValue([
    {id: 'col1', can: {qr_code: 'LZS-PT-2026-0765', owner_name: 'Hj. Maimunah'}},
  ]);
});

const renderSheet = () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SyncIssuesSheet visible onClose={jest.fn()} />);
  });
  return tree!;
};

describe('SyncIssuesSheet — Detail Sinkronisasi', () => {
  it('menampilkan seksi Menunggu & Gagal dengan pesan evakuasi sesuai kondisi nyata', () => {
    const tree = renderSheet();
    const text = allText(tree);

    expect(text).toContain('Detail Sinkronisasi');
    expect(text).toContain('Menunggu Kirim (1)');
    expect(text).toContain('Gagal — Perlu Tindakan (2)');
    // Menunggu: identitas + pesan aman tersimpan
    expect(text).toContain('H. Ahmad Fauzi');
    expect(text).toContain('Belum terkirim — aman tersimpan di perangkat');
    // Gagal penjemputan: pesan server asli diteruskan
    expect(text).toContain('Kaleng ini sudah pernah di-submit untuk assignment ini');
    expect(text).toContain('Ibu Siti Aminah');
    // Gagal koreksi: pesan server + konsekuensi
    expect(text).toContain('Hanya record terbaru yang bisa di-resubmit');
    expect(text).toContain('Nominal kembali ke nilai server');
  });

  it('Kirim Ulang pada item gagal → retryFailedCollection dipanggil dengan offline_id', async () => {
    const tree = renderSheet();
    const btn = findText(tree, 'Kirim Ulang');
    const pressable = findPressable(btn);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    expect(mockRetryFailed).toHaveBeenCalledWith('o2');
  });

  it('Buang Catatan pada koreksi gagal → removeFromFailedPermanent dipanggil', async () => {
    const tree = renderSheet();
    const btn = findText(tree, 'Buang Catatan');
    const pressable = findPressable(btn);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    expect(mockRemoveFailedCorr).toHaveBeenCalledWith(['x1']);
  });

  it('Kirim Semua Sekarang → triggerSync dipanggil', async () => {
    const tree = renderSheet();
    const btn = findText(tree, 'Kirim Semua Sekarang');
    const pressable = findPressable(btn);

    await act(async () => {
      pressable?.props?.onPress?.();
    });

    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it('batas tampilan: 60 menunggu → judul tetap (60), 50 kartu + catatan sisa', () => {
    mockCollectionQueue.mockReturnValue(
      Array.from({length: 60}, (_, i) => ({
        offline_id: `of${i}`,
        assignment_id: `ta${i}`,
        can_id: `c${i}`,
        nominal: 10000 + i,
        collected_at: '2026-08-28T08:00:00.000Z',
        retry_attempts: 0,
      })),
    );
    const tree = renderSheet();
    const text = allText(tree);

    // Judul section tetap menghitung SEMUA item, bukan yang tampil.
    expect(text).toContain('Menunggu Kirim (60)');
    // Hanya 50 kartu yang dirender (masing-masing punya tombol Kirim Sekarang).
    const actionButtons = tree.root
      .findAllByType(require('react-native').Text)
      .filter(n => collectText(n.props.children) === 'Kirim Sekarang');
    expect(actionButtons).toHaveLength(50);
    // Catatan sisa muncul.
    expect(text).toContain('…dan 10 lainnya');
  });
});
