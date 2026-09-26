'use client';

import React from 'react';
import { formatAveragePerCan, formatRupiah } from './format';

interface PerolehanHeroProps {
  /** Total nominal penjemputan pada periode (server, realtime per fetch). */
  nominal: number;
  /** Jumlah kaleng berhasil dijemput pada periode (cakupan kecamatan). */
  collected: number;
  /** Label periode, mis. 'September 2026' / 'Juli–September 2026'. */
  periodLabel: string;
  /** Label scope, mis. 'Seluruh ranting kecamatan' / 'Ranting X'. */
  scopeLabel: string;
  /** Info kesegaran, mis. 'Diperbarui 26 Sep 14.02'. */
  updatedLabel: string;
}

/**
 * Judul perolehan infaq — pengganti 4 kartu ringkasan.
 * Tanpa pembungkus kartu: angka besar + 2 sub-judul dipisah garis tipis.
 * Cakupan angka mengikuti scope server (kecamatan / satu ranting).
 */
export function PerolehanHero({ nominal, collected, periodLabel, scopeLabel, updatedLabel }: PerolehanHeroProps) {
  return (
    <section aria-labelledby="perolehan-infaq" className="flex flex-col gap-4 px-1">
      <div>
        <h2 id="perolehan-infaq" className="text-[11px] font-bold uppercase tracking-widest text-[#F4F1EA]/50">
          Total perolehan penjemputan
        </h2>
        <p className="mt-1 break-words text-3xl font-black tracking-tight text-[#F4F1EA] md:text-4xl">
          {formatRupiah(nominal)}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#F4F1EA]/60">
          {periodLabel} • {scopeLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/10" role="list">
        <div className="pr-4" role="listitem">
          <p className="text-xl font-black tracking-tight text-[#F4F1EA] md:text-2xl">
            {Number(collected || 0).toLocaleString('id-ID')}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/45">
            Kaleng dijemput
          </p>
        </div>
        <div className="pl-4" role="listitem">
          <p className="text-xl font-black tracking-tight text-[#EAD19B] md:text-2xl">
            {formatAveragePerCan(nominal, collected)}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/45">
            Rata-rata per kaleng
          </p>
        </div>
      </div>

      <p className="text-[11px] text-[#F4F1EA]/40">{updatedLabel}</p>
    </section>
  );
}

export default PerolehanHero;
