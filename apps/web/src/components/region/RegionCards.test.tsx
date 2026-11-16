import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
}));

import { RegionCards } from './RegionCards';

const region = {
  kind: 'dukuh' as const,
  isFallback: false,
  id: 'dukuh-1',
  name: 'Lambanggelun',
  branchId: 'branch-1',
  branchName: 'Ranting Lambanggelun',
  branchCode: 'LBG',
  total: 18,
  assignmentTotal: 12,
  assignableCans: 12,
  assignedAssignableCans: 12,
  unassignedAssignableCans: 0,
  visitableCans: 4,
  assignedVisitableCans: 4,
  nonAssignableCans: 6,
  breakdown: { AKTIF: 12, RUSAK: 0, HILANG: 0, NON_AKTIF: 4, DIKEMBALIKAN: 2 },
  nonActive: 4,
  assigned: 12,
  unassigned: 6,
  completed: 0,
  uncollected: 0,
  officerCount: 0,
  activeOfficerCount: 0,
  unmappedOfficerCount: 0,
  officers: [],
};

function response(overrides: Partial<typeof region> = {}) {
  return {
    success: true,
    data: {
      scope: 'dukuh' as const,
      period: { year: 2026, month: 11 },
      unmappedOfficerCount: 0,
      regions: [{ ...region, ...overrides }],
    },
  };
}

function renderCards(page: 'cans' | 'assignments' = 'cans') {
  return render(
    <RegionCards
      page={page}
      year={2026}
      month={11}
      selectedId={null}
      onSelect={() => {}}
    />,
  );
}

describe('RegionCards — ringkasan Kelola Kaleng', () => {
  beforeEach(() => apiGet.mockReset());
  afterEach(cleanup);

  it('menggabungkan cakupan PICKUP dan VISIT, menghapus angka inventory, dan menampilkan dikembalikan', async () => {
    apiGet.mockResolvedValue(response());
    renderCards('cans');

    expect(await screen.findByRole('heading', { name: 'LAMBANGGELUN' })).toBeTruthy();
    expect(screen.queryByText('Total kaleng')).toBeNull();
    expect(screen.queryByText('18')).toBeNull();
    expect(screen.getByText('cakupan tugas')).toBeTruthy();
    expect(screen.getByText('16/16')).toBeTruthy();
    expect(screen.queryByText('belum')).toBeNull();
    expect(screen.queryByText('penugasan')).toBeNull();
    expect(screen.queryByText(/nonaktif/i)).toBeNull();
    expect(screen.getByText('Dikembalikan')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('tetap mempertahankan metrik kartu halaman Penugasan', async () => {
    apiGet.mockResolvedValue(response());
    renderCards('assignments');

    expect(await screen.findByText('coverage penugasan')).toBeTruthy();
    expect(screen.getByText('12/12')).toBeTruthy();
    expect(screen.getByText('dapat ditugaskan')).toBeTruthy();
    expect(screen.getByText('belum')).toBeTruthy();
    expect(screen.queryByText('Total kaleng')).toBeNull();
  });

  it('menangani wilayah tanpa kaleng yang dapat menerima tugas tanpa persentase tak terhingga', async () => {
    apiGet.mockResolvedValue(response({
      total: 2,
      assignmentTotal: 0,
      assignableCans: 0,
      assignedAssignableCans: 0,
      unassignedAssignableCans: 0,
      visitableCans: 0,
      assignedVisitableCans: 0,
      nonAssignableCans: 2,
      breakdown: { AKTIF: 0, RUSAK: 0, HILANG: 0, NON_AKTIF: 1, DIKEMBALIKAN: 1 },
      nonActive: 1,
      assigned: 0,
      unassigned: 2,
    }));
    renderCards('cans');

    expect(await screen.findByText('0/0')).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(screen.queryByText('belum')).toBeNull();
    expect(screen.getByText('Dikembalikan')).toBeTruthy();
  });
});
