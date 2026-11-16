import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import ProduktivitasPage from './page';

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

describe('ProduktivitasPage', () => {
  it('mengelompokkan dua baris jenis tugas per PPK dan memakai label yang disepakati', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: {
        scope: { branchName: 'LAMBANGGELUN' },
        period: { year: 2026, months: [10] },
        officers: [{
          officerId: 'officer-1',
          fullName: 'PPK Uji',
          employeeCode: 'PPK-01',
          branchId: 'branch-1',
          branchName: 'LAMBANGGELUN',
          pickup: { assigned: 10, collected: 8, filled: 7, empty: 1, failed: 2 },
          visit: { assigned: 8, visited: 8, isi: 3, empty: 3, returned: 2, failed: 0 },
        }],
      },
    });

    render(<ProduktivitasPage />);

    const pickupLabel = await screen.findByText('Penjemputan');
    const visitLabel = screen.getByText('Kunjungan');
    const pickupRow = pickupLabel.closest('tr');
    const visitRow = visitLabel.closest('tr');

    expect(pickupRow).not.toBeNull();
    expect(visitRow).not.toBeNull();
    expect(within(pickupRow!).getByText('10')).toBeTruthy();
    expect(within(pickupRow!).getByText('8')).toBeTruthy();
    expect(within(pickupRow!).getByText('7')).toBeTruthy();
    expect(within(visitRow!).getAllByText('8')).toHaveLength(2);
    expect(within(visitRow!).getAllByText('3')).toHaveLength(2);
    expect(within(visitRow!).getByText('2')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Isi' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Gagal' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Terisi' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Belum selesai' })).toBeNull();
    expect(screen.getByText(/Ditugaskan mengikuti PPK penerima tugas/i)).toBeTruthy();
    expect(screen.getByText('PPK Uji').closest('td')?.getAttribute('rowspan')).toBe('2');
  });

  it('menjelaskan bila backend belum mengirim rincian per jenis tugas', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: {
        scope: { branchName: 'LAMBANGGELUN' },
        period: { year: 2026, months: [10] },
        officers: [{
          officerId: 'officer-1',
          fullName: 'PPK Uji',
          employeeCode: 'PPK-01',
          branchId: 'branch-1',
          branchName: 'LAMBANGGELUN',
          assigned: 10,
          collected: 11,
          filled: 10,
          uncollected: 2,
        }],
      },
    });

    render(<ProduktivitasPage />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/backend.*diperbarui/i);
    expect(screen.queryByText('Penjemputan')).toBeNull();
  });
});
