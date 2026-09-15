'use client';

import React from 'react';
import { GitCompareArrows } from 'lucide-react';
import type { OverviewBranchComparisonItem } from '@lazisnu/shared-types';
import { formatRupiah } from './format';

interface BranchComparisonListProps {
  comparison: OverviewBranchComparisonItem[];
  /** Perbandingan disembunyikan saat satu ranting difilter. */
  hidden?: boolean;
  onPickBranch: (branchId: string) => void;
}

/**
 * Perbandingan ranting — hanya tampil pada scope agregat kecamatan.
 * Tampil sebagai daftar (bukan tabel horizontal) agar tidak overflow di 360px;
 * setiap baris menyetel filter ranting (target sentuh memenuhi 44px).
 */
export function BranchComparisonList({ comparison, hidden = false, onPickBranch }: BranchComparisonListProps) {
  if (hidden) return null;

  const maxCoverage = Math.max(1, ...comparison.map((row) => row.placement_coverage));

  return (
    <section aria-labelledby="perbandingan-ranting" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <h2 id="perbandingan-ranting" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
        <GitCompareArrows size={16} className="text-[#EAD19B]" aria-hidden="true" />
        Perbandingan ranting
      </h2>
      <p className="mt-1 text-xs text-[#F4F1EA]/50">Pilih ranting untuk menyaring seluruh halaman.</p>

      {comparison.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-4 text-xs text-[#F4F1EA]/60">
          Belum ada ranting pada kecamatan ini.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {comparison.map((row) => (
            <li key={row.branch_id}>
              <button
                type="button"
                onClick={() => onPickBranch(row.branch_id)}
                className="w-full rounded-xl border border-white/5 bg-[#F4F1EA]/5 p-4 text-left transition-[opacity,transform] duration-200 active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[#F4F1EA]">{row.branch_name}</span>
                  <span className="text-xs font-bold text-[#EAD19B]">Cakupan {row.placement_coverage}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F4F1EA]/10">
                  <div
                    className="h-full rounded-full bg-[#1F8243]"
                    style={{ width: `${(row.placement_coverage / maxCoverage) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[#F4F1EA]/60">
                  Perlu tindakan {row.action_required} • Hilang {row.lost_cans} • Tugas {row.task_closed}/
                  {row.task_total} • {formatRupiah(row.collection_nominal)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BranchComparisonList;