'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronRight } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { OverviewProductivityTotals } from '@lazisnu/shared-types';

interface ProductivitySectionProps {
  productivity: OverviewProductivityTotals;
  /** Basis kaleng aktif (snapshot) + aktif kembali periode ini. */
  activeCans: number;
  reactivated: number;
  months: number[];
  year: number;
  /** Scope ranting saat drill-down (dibawa ke halaman per-PPK). */
  branchId?: string;
  scopeLabel: string;
}

const SLICE_FILL = {
  filled: '#1F8243',
  empty: '#EAD19B',
  uncollected: '#DE6F4A',
  active: '#6B9E9F',
};

/**
 * Produktivitas PPK — agregat satu kecamatan (bukan per-PPK).
 * Donat = hasil kunjungan periode terpilih: terisi + kosong + tak dijemput
 * + berjalan (menutup genap total ditugaskan). Basis + aktif kembali tampil
 * sebagai angka pendamping (basis berbeda, bukan potongan).
 * Seluruh blok bisa diklik → halaman tabel per-PPK (pola cans/[id]).
 */
export function ProductivitySection({ productivity, activeCans, reactivated, months, year, branchId, scopeLabel }: ProductivitySectionProps) {
  const router = useRouter();
  const { task_total: total, filled, empty, uncollected, active } = productivity;
  const hasData = total > 0 || filled > 0 || empty > 0 || uncollected > 0;

  const data = [
    { name: 'Terisi', value: filled, fill: SLICE_FILL.filled },
    { name: 'Kosong', value: empty, fill: SLICE_FILL.empty },
    { name: 'Tak dijemput', value: uncollected, fill: SLICE_FILL.uncollected },
    { name: 'Berjalan', value: active, fill: SLICE_FILL.active },
  ];

  const openDetail = () => {
    const params = new URLSearchParams({ year: String(year) });
    if (months.length > 0) params.set('months', months.join(','));
    if (branchId) params.set('branch_id', branchId);
    router.push(`/dashboard/produktivitas?${params.toString()}`);
  };

  return (
    <section aria-labelledby="produktivitas-ppk" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <button
        type="button"
        onClick={openDetail}
        className="flex w-full items-center justify-between gap-3 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
        aria-label="Lihat rincian per petugas"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
          <Activity size={16} className="text-[#1F8243]" aria-hidden="true" />
          Produktivitas PPK
        </span>
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#EAD19B]">
          Per petugas <ChevronRight size={14} aria-hidden="true" />
        </span>
      </button>
      <p className="mt-1 text-xs text-[#F4F1EA]/50">
        {scopeLabel} • {total.toLocaleString('id-ID')} kaleng ditugaskan
      </p>

      {hasData ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="h-44 shrink-0 sm:w-56"
            role="img"
            aria-label={`Hasil kunjungan: terisi ${filled}, kosong ${empty}, tak dijemput ${uncollected}, berjalan ${active}`}
          >
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
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex flex-1 flex-col gap-2">
            {data.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-bold text-[#F4F1EA]/80">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} aria-hidden="true" />
                  {d.name}
                </span>
                <span className="text-xs font-black text-[#F4F1EA]">{d.value.toLocaleString('id-ID')}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
              <span className="text-xs font-semibold text-[#F4F1EA]/60">Basis kaleng aktif</span>
              <span className="text-xs font-black text-[#F4F1EA]">{Number(activeCans || 0).toLocaleString('id-ID')}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#F4F1EA]/60">Aktif kembali</span>
              <span className="text-xs font-black text-[#1F8243]">{Number(reactivated || 0).toLocaleString('id-ID')}</span>
            </li>
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-5 text-center text-xs font-semibold text-[#F4F1EA]/60">
          Belum ada penugasan pada periode ini
        </p>
      )}
    </section>
  );
}

export default ProductivitySection;
