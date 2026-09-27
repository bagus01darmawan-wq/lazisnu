'use client';

import React from 'react';
import { Hexagon } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { OverviewConditionBreakdownItem } from '@lazisnu/shared-types';
import type { CanCondition } from '@lazisnu/shared-types';
import { CONDITION_BADGE_CLASS, CONDITION_LABEL } from './format';

interface ConditionBreakdownProps {
  breakdown: OverviewConditionBreakdownItem[];
  /** Arus periode berjalan (stok di atas timeless, arus ikut filter bulan). */
  newCans: number;
  withdrawn: number;
}

/**
 * Kondisi kaleng dalam bentuk radar + legenda berlabel.
 * Setiap sudut menyertakan label teks + angka, jadi kondisi tidak
 * dibedakan warna saja.
 */
export function ConditionBreakdown({ breakdown, newCans, withdrawn }: ConditionBreakdownProps) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  const data = breakdown.map((item) => ({
    condition: CONDITION_LABEL[item.condition as CanCondition],
    count: item.count,
  }));

  return (
    <section aria-labelledby="kondisi-kaleng" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <h2 id="kondisi-kaleng" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
        <Hexagon size={16} className="text-[#6B9E9F]" aria-hidden="true" />
        Kondisi Kaleng
      </h2>
      <p className="mt-1 text-xs text-[#F4F1EA]/50">
        Total {total} kaleng pada scope ini. Dikembalikan tetap terlihat, tetapi keluar dari cakupan.
      </p>

      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-5 text-center text-xs font-semibold text-[#F4F1EA]/60">
          Belum ada data kaleng pada scope ini
        </p>
      ) : (
        <>
          <div
            className="h-64"
            role="img"
            aria-label={`Komposisi kondisi: ${breakdown.map((i) => `${CONDITION_LABEL[i.condition as CanCondition]} ${i.count}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="72%">
                <PolarGrid stroke="rgba(244,241,234,0.12)" />
                <PolarAngleAxis
                  dataKey="condition"
                  tick={{ fontSize: 11, fill: '#F4F1EA', fontWeight: 700 }}
                />
                <Tooltip
                  formatter={(value) => [`${value} kaleng`, 'Jumlah']}
                  contentStyle={{
                    backgroundColor: '#2C473E',
                    border: '1px solid rgba(244,241,234,0.15)',
                    borderRadius: 12,
                    color: '#F4F1EA',
                    fontSize: 12,
                  }}
                />
                <Radar dataKey="count" stroke="#1F8243" fill="#1F8243" fillOpacity={0.45} isAnimationActive={false} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-2 flex flex-col gap-2">
            {breakdown.map((item) => {
              const percent = Math.round((item.count / total) * 100);
              return (
                <li key={item.condition} className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${CONDITION_BADGE_CLASS[item.condition as CanCondition]}`}
                  >
                    {CONDITION_LABEL[item.condition as CanCondition]}
                  </span>
                  <span className="text-xs font-bold text-[#F4F1EA]/80">
                    {item.count} ({percent}%)
                  </span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
              <span className="text-xs font-semibold text-[#F4F1EA]/60">Baru disebar periode ini</span>
              <span className="text-xs font-black text-[#1F8243]">{Number(newCans || 0).toLocaleString('id-ID')}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#F4F1EA]/60">Ditarik periode ini</span>
              <span className="text-xs font-black text-[#D97A76]">{Number(withdrawn || 0).toLocaleString('id-ID')}</span>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

export default ConditionBreakdown;
