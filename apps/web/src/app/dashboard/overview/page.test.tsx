import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OverviewResponseView } from '@/components/overview/overviewView';

const apiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
  },
}));

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: {
      id: 'u1',
      email: 'admin@test.local',
      fullName: 'Admin Test',
      role: 'ADMIN_RANTING',
      districtId: 'd1',
      branchId: 'b1',
    },
  }),
}));

vi.mock('@/hooks/useOperationalPeriod', () => ({
  useOperationalPeriod: () => ({
    context: null,
    loading: false,
    displayYear: 2026,
    displayMonth: 11,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import OverviewPage from './page';
import { toCamelCase } from '@/lib/caseConverter';

afterEach(cleanup);

/** Respons asli staging untuk months=9,10,11 (snake_case sebelum interceptor). */
function overviewData(): OverviewResponseView {
  const emptyLifecycle = { total: 0, by_category: { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 } };
  const emptyPhysical = { total: 0, by_category: { BAIK: 0, RUSAK: 0, HILANG: 0 } };
  const period = (month: number, completeness: 'unavailable' | 'partial') => ({
    period: `2026-${String(month).padStart(2, '0')}`,
    year: 2026,
    month,
    completeness,
    lifecycle: emptyLifecycle,
    physical_condition: emptyPhysical,
  });

  const wire = {
    scope: { type: 'branch', district_id: 'd1', branch_id: 'b1', branch_name: 'LAMBANGGELUN' },
    period: {
      year: 2026,
      month: 11,
      months: [9, 10, 11],
      timezone: 'Asia/Jakarta',
      generated_at: '2026-11-15T21:10:40.015Z',
    },
    summary: {
      placement_coverage: 14,
      active_cans: 12,
      inactive_cans: 4,
      damaged_cans: 3,
      lost_cans: 2,
      returned_this_month: 2,
      returned_total: 2,
      action_required: 9,
      total_officers: 1,
      collection_nominal: 135250,
      successful_collections: 11,
      reactivated: 0,
      task_active: 0,
      task_closed: 10,
      task_completed: 8,
      task_uncollected: 2,
      task_total: 10,
    },
    condition_breakdown: [
      { condition: 'AKTIF', count: 7 },
      { condition: 'NON_AKTIF', count: 4 },
      { condition: 'RUSAK', count: 3 },
      { condition: 'HILANG', count: 2 },
      { condition: 'DIKEMBALIKAN', count: 2 },
    ],
    can_state_snapshot: {
      cutoff_at: '2026-11-15T21:10:38.584Z',
      cutover_at: '2026-11-14T04:08:27.000Z',
      history_complete: true,
      status: { AKTIF: 12, NON_AKTIF: 4, DIKEMBALIKAN: 2 },
      physical_condition: { BAIK: 13, RUSAK: 3, HILANG: 2 },
      assumption_baik: 6,
      placement_coverage: 14,
      action_required: 9,
      legacy_breakdown: [
        { condition: 'AKTIF', count: 7 },
        { condition: 'NON_AKTIF', count: 4 },
        { condition: 'RUSAK', count: 3 },
        { condition: 'HILANG', count: 2 },
        { condition: 'DIKEMBALIKAN', count: 2 },
      ],
    },
    can_state_changes_by_task_period: {
      coverage_start: '2026-11-13T21:08:27.000Z',
      completeness: 'unavailable',
      unattributed_events: 0,
      periods: [period(9, 'unavailable'), period(10, 'unavailable'), period(11, 'partial')],
      lifecycle: emptyLifecycle,
      physical_condition: emptyPhysical,
    },
    monthly_trend: Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      collected: index === 9 ? 11 : 0,
      empty: index === 9 ? 1 : 0,
      uncollected: index === 9 ? 2 : 0,
      task_closed: index === 9 ? 10 : 0,
      task_total: index === 9 ? 10 : 0,
      nominal: index === 9 ? 135250 : 0,
    })),
    productivity: { task_total: 10, filled: 10, empty: 1, uncollected: 2, active: 0 },
  };

  return toCamelCase(wire) as unknown as OverviewResponseView;
}

describe('OverviewPage — filter 3 bulan', () => {
  it('merender kartu Status & Kondisi tanpa jatuh ke error boundary', async () => {
    apiGet.mockResolvedValue({ success: true, data: overviewData() });

    render(<OverviewPage />);

    expect(await screen.findByRole('heading', { name: 'Status & Kondisi Kaleng' })).toBeTruthy();
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByText('Oktober 2026')).toBeTruthy();
    // November muncul di picker dan di rincian per periode.
    expect(screen.getAllByText('November 2026').length).toBeGreaterThan(0);
  });
});
