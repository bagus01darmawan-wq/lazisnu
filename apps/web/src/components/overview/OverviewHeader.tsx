'use client';

import React from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import type { Branch, OverviewResponse } from '@lazisnu/shared-types';
import { formatPeriod, formatUpdatedAt } from './format';

interface OverviewHeaderProps {
  data: OverviewResponse | null;
  /** Daftar ranting hanya diberikan untuk admin kecamatan. */
  branches?: Branch[];
  selectedBranchId: string;
  onBranchChange?: (branchId: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

/**
 * Header overview: judul tugas, scope aktif, periode, dan (khusus admin kecamatan)
 * pemilih ranting. Admin ranting TIDAK menerima pemilih ini sama sekali — scope-nya
 * sudah ditentukan server dari token.
 */
export function OverviewHeader({
  data,
  branches,
  selectedBranchId,
  onBranchChange,
  onRefresh,
  refreshing = false,
}: OverviewHeaderProps) {
  const scopeLabel = data?.scope.branch_name
    ? `Ranting ${data.scope.branch_name}`
    : 'Seluruh ranting kecamatan';

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-[#F4F1EA]">Overview kaleng</h1>
        <p className="mt-1 text-sm text-[#F4F1EA]/60">
          {scopeLabel} • Data ditentukan otomatis dari akun Anda
        </p>
        <p className="mt-1 text-xs text-[#F4F1EA]/45">
          {data
            ? `Periode ${formatPeriod(data.period.year, data.period.month)} • Zona ${data.period.timezone} • Diperbarui ${formatUpdatedAt(data.period.generated_at)}`
            : 'Memuat periode dan scope…'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {branches && branches.length > 0 && onBranchChange && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#F4F1EA]/60">
            <span className="flex items-center gap-1">
              <Building2 size={14} aria-hidden="true" /> Ranting
            </span>
            <select
              value={selectedBranchId}
              onChange={(event) => onBranchChange(event.target.value)}
              className="min-h-11 rounded-xl border border-white/10 bg-[#2C473E] px-3 text-sm font-semibold text-[#F4F1EA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
              aria-label="Pilih ranting yang ditampilkan"
            >
              <option value="">Semua ranting</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        )}

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