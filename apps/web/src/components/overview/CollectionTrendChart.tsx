'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { OverviewMonthlyTrendItem } from '@lazisnu/shared-types';
import { formatMonthKey, formatRupiah, trendTotals } from './format';

interface CollectionTrendChartProps {
  trend: OverviewMonthlyTrendItem[];
}

/**
 * Tren 6 bulan: isi / kosong / tidak terjemput.
 * Aksesibilitas: seri dibedakan bukan hanya warna (label Legend + teks ringkasan +
 * tabel fallback yang bisa dibaca keyboard/screen reader). Animasi dimatikan agar
 * data stabil saat refresh dan menghormati prefers-reduced-motion.
 */
export function CollectionTrendChart({ trend }: CollectionTrendChartProps) {
  const totals = trendTotals(trend);

  return (
    <section aria-labelledby="tren-operasional" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tren-operasional" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
          <TrendingUp size={16} className="text-[#EAD19B]" aria-hidden="true" />
          Tren 6 bulan
        </h2>
        <p className="text-xs text-[#F4F1EA]/55">
          {trendTotalsLabel(totals.collected, totals.empty, totals.uncollected)} •{' '}
          {formatRupiah(totals.nominal)} total
        </p>
      </div>

      <div className="mt-4 h-56 w-full md:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244,241,234,0.08)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#F4F1EA', fontWeight: 600 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#F4F1EA' }}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(244,241,234,0.06)' }}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: '#2C473E',
                fontSize: 12,
                color: '#F4F1EA',
              }}
              labelFormatter={(label) => formatMonthKey(String(label))}
              formatter={(value, name) => [String(value ?? 0), SERIES_LABEL[String(name)] ?? String(name)]}
            />
            <Legend formatter={(value: unknown) => SERIES_LABEL[String(value)] ?? String(value)} />
            <Bar dataKey="collected" stackId="a" fill="#1F8243" isAnimationActive={false} />
            <Bar dataKey="empty" stackId="a" fill="#EAD19B" isAnimationActive={false} />
            <Bar dataKey="uncollected" fill="#D97A76" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Fallback data tabel — bisa dibaca tanpa chart (screen reader & prefers-reduced-motion). */}
      <table className="mt-4 w-full text-left text-xs">
        <caption className="sr-only">Data tren penjemputan enam bulan terakhir</caption>
        <thead>
          <tr className="text-[#F4F1EA]/50">
            <th scope="col" className="py-1.5 font-bold">Bulan</th>
            <th scope="col" className="py-1.5 font-bold">Isi</th>
            <th scope="col" className="py-1.5 font-bold">Kosong</th>
            <th scope="col" className="py-1.5 font-bold">Tidak terjemput</th>
            <th scope="col" className="py-1.5 font-bold">Nominal</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((item) => (
            <tr key={item.month} className="border-t border-white/5 text-[#F4F1EA]/80">
              <th scope="row" className="py-1.5 font-semibold">{formatMonthKey(item.month)}</th>
              <td className="py-1.5">{item.collected}</td>
              <td className="py-1.5">{item.empty}</td>
              <td className="py-1.5">{item.uncollected}</td>
              <td className="py-1.5">{formatRupiah(item.nominal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const SERIES_LABEL: Record<string, string> = {
  collected: 'Berisi',
  empty: 'Kosong',
  uncollected: 'Tidak terjemput',
};

function trendTotalsLabel(collected: number, empty: number, uncollected: number): string {
  return `${collected} berisi • ${empty} kosong • ${uncollected} tidak terjemput`;
}

export default CollectionTrendChart;