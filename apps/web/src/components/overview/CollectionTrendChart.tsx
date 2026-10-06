'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { OverviewMonthlyTrendItemView } from './overviewView';
import { formatMonthKey, formatRupiah, trendTotals } from './format';

interface CollectionTrendChartProps {
  trend: OverviewMonthlyTrendItemView[];
  year: number;
}

type TrendMode = 'kunjungan' | 'rata-rata';

/** Rata-rata isi per kaleng yang dijemput bulan itu (Rp, dibulatkan). */
function monthlyAverage(item: OverviewMonthlyTrendItemView): number {
  if (!item.collected) return 0;
  return Math.round(item.nominal / item.collected);
}

/**
 * Tren 12 bulan (Januari–Desember tahun terpilih): hasil kunjungan /
 * rata-rata perolehan, bisa digeser via segmented control.
 * Aksesibilitas: seri dibedakan bukan hanya warna (label Legend + teks
 * ringkasan + tabel fallback yang bisa dibaca keyboard/screen reader).
 * Animasi dimatikan agar data stabil saat refresh dan menghormati
 * prefers-reduced-motion.
 */
export function CollectionTrendChart({ trend, year }: CollectionTrendChartProps) {
  const [mode, setMode] = React.useState<TrendMode>('kunjungan');
  const totals = trendTotals(trend);
  const avgData = trend.map((t) => ({ ...t, average: monthlyAverage(t) }));

  return (
    <section aria-labelledby="tren-operasional" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tren-operasional" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
          <TrendingUp size={16} className="text-[#EAD19B]" aria-hidden="true" />
          Tren 12 bulan {year}
        </h2>
        <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm" role="tablist" aria-label="Jenis tren">
          {(
            [
              { key: 'kunjungan', label: 'Hasil Kunjungan' },
              { key: 'rata-rata', label: 'Rata-rata' },
            ] as Array<{ key: TrendMode; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              onClick={() => setMode(tab.key)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                mode === tab.key
                  ? 'bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20'
                  : 'text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'kunjungan' ? (
        <>
          <p className="mt-1 text-xs text-[#F4F1EA]/55">
            {trendTotalsLabel(totals.collected, totals.empty, totals.uncollected)} •{' '}
            {formatRupiah(totals.nominal)} total
          </p>
          <div className="mt-4 h-56 w-full md:h-72" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244,241,234,0.08)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthKey}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#F4F1EA', fontWeight: 600 }}
                  angle={-45}
                  textAnchor="end"
                  height={52}
                  interval={0}
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
            <caption className="sr-only">Data tren penjemputan Januari sampai Desember</caption>
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
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-[#F4F1EA]/55">
            Rata-rata isi per kaleng yang dijemput tiap bulan (nominal ÷ dijemput)
          </p>
          <div className="mt-4 h-56 w-full md:h-72" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avgData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244,241,234,0.08)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthKey}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#F4F1EA', fontWeight: 600 }}
                  angle={-45}
                  textAnchor="end"
                  height={52}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#F4F1EA' }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
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
                  formatter={(value) => [formatRupiah(Number(value ?? 0)), 'Rata-rata']}
                />
                <Bar dataKey="average" fill="#6B9E9F" isAnimationActive={false} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table className="mt-4 w-full text-left text-xs">
            <caption className="sr-only">Rata-rata perolehan per bulan Januari sampai Desember</caption>
            <thead>
              <tr className="text-[#F4F1EA]/50">
                <th scope="col" className="py-1.5 font-bold">Bulan</th>
                <th scope="col" className="py-1.5 font-bold">Dijemput</th>
                <th scope="col" className="py-1.5 font-bold">Nominal</th>
                <th scope="col" className="py-1.5 font-bold">Rata-rata</th>
              </tr>
            </thead>
            <tbody>
              {avgData.map((item) => (
                <tr key={item.month} className="border-t border-white/5 text-[#F4F1EA]/80">
                  <th scope="row" className="py-1.5 font-semibold">{formatMonthKey(item.month)}</th>
                  <td className="py-1.5">{item.collected}</td>
                  <td className="py-1.5">{formatRupiah(item.nominal)}</td>
                  <td className="py-1.5 font-bold text-[#F4F1EA]">{formatRupiah(item.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
