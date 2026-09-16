'use client';

import React from 'react';
import { PieChart } from 'lucide-react';
import type { OverviewConditionBreakdownItem } from '@lazisnu/shared-types';
import { CONDITION_BADGE_CLASS, CONDITION_LABEL } from './format';

interface ConditionBreakdownProps {
  breakdown: OverviewConditionBreakdownItem[];
}

/**
 * Komposisi kondisi kaleng dalam bentuk batang sederhana (bukan donat wajib).
 * Setiap baris menyertakan label teks + badge, jadi kondisi tidak dibedakan warna saja.
 */
export function ConditionBreakdown({ breakdown }: ConditionBreakdownProps) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <section aria-labelledby="komposisi-kondisi" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <h2 id="komposisi-kondisi" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
        <PieChart size={16} className="text-[#6B9E9F]" aria-hidden="true" />
        Komposisi kondisi kaleng
      </h2>
      <p className="mt-1 text-xs text-[#F4F1EA]/50">
        Total {total} kaleng pada scope ini. Dikembalikan tetap terlihat, tetapi keluar dari cakupan.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {breakdown.map((item) => {
          const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <li key={item.condition}>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${CONDITION_BADGE_CLASS[item.condition]}`}
                >
                  {CONDITION_LABEL[item.condition]}
                </span>
                <span className="text-xs font-bold text-[#F4F1EA]/80">
                  {item.count} ({percent}%)
                </span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F4F1EA]/10"
                role="img"
                aria-label={`${CONDITION_LABEL[item.condition]}: ${item.count} kaleng, ${percent}% dari total`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ConditionBreakdown;