/**
 * Regresi: respons `/admin/period-context` melewati interceptor axios yang
 * mengubah snake_case → camelCase. Hook wajib membaca `displayPeriod`, bukan
 * `display_period` — salah baca membuat TypeError saat render dan memicu
 * halaman "Terjadi Kesalahan" di overview/setoran/cans/assignments.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOperationalPeriod } from '../useOperationalPeriod';
import { c1Api, type PeriodStateView } from '@/lib/c1';

vi.mock('@/lib/c1', () => ({
  c1Api: { getPeriodContext: vi.fn() },
}));

const getPeriodContext = vi.mocked(c1Api.getPeriodContext);

function Harness() {
  const { displayYear, displayMonth, loading } = useOperationalPeriod();
  return (
    <span data-testid="period">{loading ? 'loading' : `${displayYear}-${displayMonth}`}</span>
  );
}

const contextAfterInterceptor: PeriodStateView = {
  currentPeriod: { year: 2026, month: 11 },
  displayPeriod: { year: 2026, month: 10 },
  displayReason: 'BRANCH_DRAFT',
  unsettled: [
    { year: 2026, month: 10, period: '2026-10', reason: 'BRANCH_DRAFT', waitingFor: 'ADMIN' },
  ],
};

describe('useOperationalPeriod', () => {
  afterEach(cleanup);

  beforeEach(() => {
    getPeriodContext.mockReset();
  });

  it('membaca displayPeriod dari respons yang sudah camelCase', async () => {
    getPeriodContext.mockResolvedValue({ success: true, data: contextAfterInterceptor });

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('period').textContent).toBe('2026-10'));
  });

  it('tetap aman (null) saat request gagal', async () => {
    getPeriodContext.mockRejectedValue(new Error('SCOPE_MISSING'));

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('period').textContent).toBe('null-null'));
  });
});
