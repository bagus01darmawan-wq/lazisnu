'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { OverviewResponse } from '@lazisnu/shared-types';
import { formatPeriodRange, formatUpdatedAt } from './format';
import { PeriodPicker } from '@/components/ui/PeriodPicker';

interface OverviewHeaderProps {
  data: OverviewResponse | null;
  /** Periode terpilih (filter multi-bulan ala assignments). */
  months: number[];
  year: number;
  onPeriodChange: (months: number[], year: number) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

/**
 * Header overview: judul, scope aktif, periode, filter bulan, dan tombol
 * perbarui. Filter ranting dihapus — scope selalu kecamatan (admin kecamatan)
 * atau ranting akun (admin ranting); drill-down ranting lewat daftar
 * perbandingan.
 */
export function OverviewHeader({
  data,
  months,
  year,
  onPeriodChange,
  onRefresh,
  refreshing = false,
}: OverviewHeaderProps) {
  const scopeLabel = data?.scope.branch_name
    ? `Ranting ${data.scope.branch_name}`
    : 'Seluruh ranting kecamatan';
  const periodMonths = data?.period.months?.length ? data.period.months : months;

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-[#F4F1EA]">Overview kaleng</h1>
        <p className="mt-1 text-sm text-[#F4F1EA]/60">
          {scopeLabel} • Data ditentukan otomatis dari akun Anda
        </p>
        <p className="mt-1 text-xs text-[#F4F1EA]/45">
          {data
            ? `Periode ${formatPeriodRange(data.period.year, periodMonths)} • Zona ${data.period.timezone} • Diperbarui ${formatUpdatedAt(data.period.generated_at)}`
            : 'Memuat periode dan scope…'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <PeriodPicker months={months} year={year} onChange={onPeriodChange} />

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#F4F1EA]/5 px-4 text-sm font-bold text-[#F4F1EA] transition-[opacity,transform] duration-200 active:scale-[.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B] disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          {refreshing ? 'Memperbarui…' : 'Perbarui'}
        </button>
      </div>
    </header>
  );
}

export default OverviewHeader;
