import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConditionBreakdown } from './ConditionBreakdown';
import type { OverviewCanChangesByTaskPeriodView } from './overviewView';

afterEach(cleanup);

const changes = (
  overrides: Partial<OverviewCanChangesByTaskPeriodView> = {},
): OverviewCanChangesByTaskPeriodView => ({
  coverageStart: '2026-09-15T00:00:00.000Z',
  completeness: 'complete',
  unattributedEvents: 0,
  periods: [
    {
      period: '2026-10',
      taskPeriod: { year: 2026, month: 10 },
      completeness: 'complete',
      lifecycle: { total: 4, byCategory: { AKTIF: 2, NON_AKTIF: 1, DIKEMBALIKAN: 1 } },
      physicalCondition: { total: 4, byCategory: { BAIK: 2, RUSAK: 1, HILANG: 1 } },
    },
  ],
  lifecycle: { total: 4, byCategory: { AKTIF: 2, NON_AKTIF: 1, DIKEMBALIKAN: 1 } },
  physicalCondition: { total: 4, byCategory: { BAIK: 2, RUSAK: 1, HILANG: 1 } },
  ...overrides,
});

describe('ConditionBreakdown — rekap perubahan per periode tugas', () => {
  it('menampilkan judul kartu dan kedua kelompok bernama', () => {
    render(<ConditionBreakdown changes={changes()} />);

    expect(screen.getByRole('heading', { name: 'Status & Kondisi Kaleng' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Status Kaleng' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kondisi Kaleng' })).toBeTruthy();
  });

  it('menjelaskan kaleng yang berubah, bukan posisi akhir periode', () => {
    render(<ConditionBreakdown changes={changes()} />);

    expect(screen.getByText(/mengalami perubahan terkait periode tugas terpilih/i)).toBeTruthy();
    expect(screen.getByText(/perubahan manual yang periode tugasnya ditetapkan eksplisit/i)).toBeTruthy();
    expect(screen.queryByText(/Posisi pada akhir periode filter/i)).toBeNull();
  });

  it('menampilkan angka dan persentase di dalam kelompok masing-masing', () => {
    render(<ConditionBreakdown changes={changes()} />);

    // Status 2/4, 1/4, 1/4 — angka 2/4 juga muncul di kelompok kondisi.
    expect(screen.getAllByText('2 (50%)')).toHaveLength(2);
    expect(screen.getAllByText('1 (25%)')).toHaveLength(4);
  });

  it('menampilkan status lengkap tanpa peringatan', () => {
    render(<ConditionBreakdown changes={changes()} />);

    expect(screen.getByText('Lengkap')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('menampilkan status sementara untuk periode berjalan', () => {
    render(<ConditionBreakdown changes={changes({ completeness: 'provisional' })} />);

    expect(screen.getByText('Sementara')).toBeTruthy();
    expect(screen.getByText(/Periode berjalan belum tuntas/i)).toBeTruthy();
  });

  it('menandai data parsial dan jumlah event tanpa atribusi', () => {
    render(<ConditionBreakdown changes={changes({ completeness: 'partial', unattributedEvents: 3 })} />);

    expect(screen.getByText('Parsial')).toBeTruthy();
    expect(screen.getByText(/3 event/)).toBeTruthy();
    expect(screen.getByText(/belum memiliki atribusi periode tugas/)).toBeTruthy();
  });

  it('tidak menampilkan nol sebagai lengkap saat riwayat tidak tersedia', () => {
    render(
      <ConditionBreakdown
        changes={changes({
          completeness: 'unavailable',
          lifecycle: { total: 0, byCategory: { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 } },
          physicalCondition: { total: 0, byCategory: { BAIK: 0, RUSAK: 0, HILANG: 0 } },
        })}
      />,
    );

    expect(screen.getByText(/Riwayat perubahan periode ini tidak tersedia/i)).toBeTruthy();
    expect(screen.getAllByText(/Belum ada perubahan teratribusi/i)).toHaveLength(2);
    expect(screen.queryByText('Tidak ada kaleng yang berubah pada periode ini')).toBeNull();
  });

  it('menampilkan nol terverifikasi hanya saat kelengkapan lengkap', () => {
    render(
      <ConditionBreakdown
        changes={changes({
          completeness: 'complete',
          lifecycle: { total: 0, byCategory: { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 } },
          physicalCondition: { total: 0, byCategory: { BAIK: 0, RUSAK: 0, HILANG: 0 } },
        })}
      />,
    );

    expect(screen.getAllByText(/Tidak ada kaleng yang berubah pada periode ini/i)).toHaveLength(2);
  });

  it('menampilkan rincian per periode untuk rentang multi-bulan', () => {
    render(
      <ConditionBreakdown
        changes={changes({
          periods: [
            {
              period: '2026-09',
              taskPeriod: { year: 2026, month: 9 },
              completeness: 'partial',
              lifecycle: { total: 1, byCategory: { AKTIF: 0, NON_AKTIF: 1, DIKEMBALIKAN: 0 } },
              physicalCondition: { total: 0, byCategory: { BAIK: 0, RUSAK: 0, HILANG: 0 } },
            },
            {
              period: '2026-11',
              taskPeriod: { year: 2026, month: 11 },
              completeness: 'provisional',
              lifecycle: { total: 1, byCategory: { AKTIF: 0, NON_AKTIF: 1, DIKEMBALIKAN: 0 } },
              physicalCondition: { total: 1, byCategory: { BAIK: 0, RUSAK: 0, HILANG: 1 } },
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Rincian per periode tugas')).toBeTruthy();
    expect(screen.getByText(/September 2026/)).toBeTruthy();
    expect(screen.getByText(/November 2026/)).toBeTruthy();
    expect(screen.getByText(/Status 1 · Kondisi 0/)).toBeTruthy();
    expect(screen.getByText(/Status 1 · Kondisi 1/)).toBeTruthy();
  });

  it('menyediakan accessible name yang memuat kategori dan angka', () => {
    render(<ConditionBreakdown changes={changes()} />);

    expect(
      screen.getByRole('img', { name: 'Status Kaleng: Aktif 2, Nonaktif 1, Dikembalikan 1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Kondisi Kaleng: Baik 2, Rusak 1, Hilang 1' }),
    ).toBeTruthy();
  });
});
