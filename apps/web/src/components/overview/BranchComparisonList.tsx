'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import type { OverviewBranchComparisonItemView } from './overviewView';
import { formatAveragePerCan, splitRupiah } from './format';
import { cleanBranchName } from '@/lib/formatters';

interface BranchComparisonListProps {
  comparison: OverviewBranchComparisonItemView[];
  /** Perbandingan disembunyikan saat satu ranting difilter. */
  hidden?: boolean;
  onPickBranch: (branchId: string) => void;
}

/**
 * Perolehan penjemputan per ranting — kartu grid (1 kolom HP, 2 tablet,
 * 3 desktop). Tiap kartu: nama desa/ranting, total perolehan koin, total
 * kaleng isi, rata-rata per kaleng. Klik kartu = drill-down filter ranting.
 */
export function BranchComparisonList({ comparison, hidden = false, onPickBranch }: BranchComparisonListProps) {
  if (hidden) return null;

  return (
    <section aria-labelledby="perolehan-per-ranting" className="flex flex-col gap-4">
      <h2 id="perolehan-per-ranting" className="text-center text-sm font-semibold text-[#F4F1EA]/70">
        Perolehan Penjemputan per-Ranting
      </h2>

      {comparison.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#F4F1EA]/5 p-4 text-center text-xs text-[#F4F1EA]/60">
          Belum ada ranting pada kecamatan ini.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comparison.map((row) => {
            const { currency, amount } = splitRupiah(row.collectionNominal);

            return (
              <li key={row.branchId}>
                <button
                  type="button"
                  onClick={() => onPickBranch(row.branchId)}
                  aria-label={`Saring ke ${row.branchName}`}
                  className="flex h-full w-full flex-col gap-2 rounded-2xl border border-white/5 bg-[var(--glass)] p-5 text-center transition-all duration-300 hover:border-[#EAD19B]/30 hover:-translate-y-0.5 active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
                >
                  <span className="flex items-center justify-center gap-1.5 text-sm font-black tracking-tight text-[#F4F1EA]">
                    <MapPin size={13} className="text-[#EAD19B] shrink-0" aria-hidden="true" />
                    <span className="truncate">{cleanBranchName(row.branchName).toUpperCase()}</span>
                  </span>
                  <span className="break-words text-xl font-black tracking-tight text-[#EAD19B] md:text-2xl">
                    <span className="align-middle text-xs font-bold text-[#EAD19B]/70 md:text-sm">{currency} </span>
                    <span>{amount}</span>
                  </span>
                  <span className="flex items-center justify-center gap-4 text-[11px] font-semibold text-[#F4F1EA]/60">
                    <span>
                      <span className="font-black text-[#F4F1EA]">{Number(row.collectionFilled || 0).toLocaleString('id-ID')}</span>{' '}
                      kaleng isi
                    </span>
                    <span aria-hidden="true" className="text-[#F4F1EA]/20">|</span>
                    <span>
                      rata-rata{' '}
                      <span className="font-black text-[#F4F1EA]">{formatAveragePerCan(row.collectionNominal, row.collectionFilled)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default BranchComparisonList;
