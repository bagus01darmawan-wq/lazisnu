import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConditionBreakdown } from './ConditionBreakdown';
import type { OverviewCanStateSnapshotView } from './overviewView';

afterEach(cleanup);

const snapshot = (overrides: Partial<OverviewCanStateSnapshotView> = {}): OverviewCanStateSnapshotView => ({
  cutoffAt: '2026-10-31T17:00:00.000Z',
  cutoverAt: '2026-11-13T00:00:00.000Z',
  historyComplete: true,
  status: { AKTIF: 10, NON_AKTIF: 3, DIKEMBALIKAN: 1 },
  physicalCondition: { BAIK: 9, RUSAK: 4, HILANG: 1 },
  assumptionBaik: 0,
  placementCoverage: 13,
  actionRequired: 8,
  legacyBreakdown: [],
  ...overrides,
});

describe('ConditionBreakdown — dua kelompok Status & Kondisi', () => {
  it('menampilkan judul kartu dan kedua kelompok bernama', () => {
    render(<ConditionBreakdown snapshot={snapshot()} />);

    expect(screen.getByRole('heading', { name: 'Status & Kondisi Kaleng' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Status Kaleng' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kondisi Kaleng' })).toBeTruthy();
  });

  it('menampilkan angka dan persentase di dalam kelompok masing-masing', () => {
    render(<ConditionBreakdown snapshot={snapshot()} />);

    // Status 10/14, 3/14, 1/14.
    expect(screen.getByText('10 (71%)')).toBeTruthy();
    expect(screen.getByText('3 (21%)')).toBeTruthy();
    // '1 (7%)' muncul sekali di masing-masing kelompok (Dikembalikan & Hilang).
    expect(screen.getAllByText('1 (7%)')).toHaveLength(2);
    // Kondisi fisik 9/14, 4/14, 1/14 (denominator kelompok sendiri).
    expect(screen.getByText('9 (64%)')).toBeTruthy();
    expect(screen.getByText('4 (29%)')).toBeTruthy();
  });

  it('tidak lagi menampilkan arus baru disebar/ditarik', () => {
    render(<ConditionBreakdown snapshot={snapshot()} />);

    expect(screen.queryByText(/Baru disebar/i)).toBeNull();
    expect(screen.queryByText(/Ditarik/i)).toBeNull();
  });

  it('menandai jumlah kondisi Baik hasil asumsi backfill', () => {
    render(<ConditionBreakdown snapshot={snapshot({ assumptionBaik: 2 })} />);

    expect(screen.getByText(/2 kondisi Baik berasal dari asumsi backfill/i)).toBeTruthy();
  });

  it('menampilkan peringatan bila riwayat status belum lengkap', () => {
    render(<ConditionBreakdown snapshot={snapshot({ historyComplete: false })} />);

    expect(screen.getByText(/Riwayat status belum lengkap/i)).toBeTruthy();
  });

  it('tidak menampilkan peringatan kelengkapan saat riwayat lengkap', () => {
    render(<ConditionBreakdown snapshot={snapshot()} />);

    expect(screen.queryByText(/Riwayat status belum lengkap/i)).toBeNull();
  });

  it('menyediakan accessible name yang memuat kategori dan angka', () => {
    render(<ConditionBreakdown snapshot={snapshot()} />);

    expect(
      screen.getByRole('img', { name: 'Status Kaleng: Aktif 10, Nonaktif 3, Dikembalikan 1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Kondisi Kaleng: Baik 9, Rusak 4, Hilang 1' }),
    ).toBeTruthy();
  });
});
