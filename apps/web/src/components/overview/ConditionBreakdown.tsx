'use client';

import React from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { OverviewConditionBreakdownItem } from '@lazisnu/shared-types';
import type { CanCondition } from '@lazisnu/shared-types';
import { CONDITION_BADGE_CLASS, CONDITION_LABEL } from './format';

interface ConditionBreakdownProps {
  breakdown: OverviewConditionBreakdownItem[];
}

/** Warna isi segmen — sepasang dengan badge tiap kondisi. */
const SEGMENT_FILL: Record<CanCondition, string> = {
  AKTIF: '#1F8243',
  NON_AKTIF: '#8A938E',
  RUSAK: '#DE6F4A',
  HILANG: '#D97A76',
  DIKEMBALIKAN: '#6B9E9F',
};

/**
 * Kondisi kaleng dalam bentuk donat. Setiap segmen tetap didampingi legenda
 * berlabel teks + angka (kondisi tidak dibedakan warna saja).
 */
export function ConditionBreakdown({ breakdown }: ConditionBreakdownProps) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  const data = breakdown.map((item) => ({
    name: CONDITION_LABEL[item.condition as CanCondition],
    value: item.count,
    fill: SEGMENT_FILL[item.condition as CanCondition],
  }));

  return (
    <section aria-labelledby="kondisi-kaleng" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <h2 id="kondisi-kaleng" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
        <PieChartIcon size={16} className="text-[#6B9E9F]" aria-hidden="true" />
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
          <div className="h-56" role="img" aria-label={`Komposisi kondisi: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
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
          </ul>
        </>
      )}
    </section>
  );
}

export default ConditionBreakdown;
