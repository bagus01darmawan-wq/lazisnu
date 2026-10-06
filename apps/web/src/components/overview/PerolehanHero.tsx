'use client';

import React from 'react';
import { splitRupiah } from './format';

interface PerolehanHeroProps {
  /** Total nominal penjemputan pada periode (server, realtime per fetch). */
  nominal: number;
  /** Jumlah kaleng berhasil dijemput pada periode (cakupan kecamatan). */
  collected: number;
}

/**
 * Judul perolehan infaq — pengganti 4 kartu ringkasan.
 * Tanpa pembungkus kartu: label + angka besar di tengah, lalu 2 sub-judul
 * di tengah kolom masing-masing, dipisah garis tipis pola huruf T
 * (garis horizontal + pembagi vertikal). Cakupan angka mengikuti scope
 * server (kecamatan / satu ranting). Baris periode/scope/zona tidak
 * ditampilkan di sini — sudah ada di bawah judul halaman.
 */
export function PerolehanHero({ nominal, collected }: PerolehanHeroProps) {
  const { currency, amount } = splitRupiah(nominal);
  const avgNominal = collected ? Math.round(Number(nominal || 0) / collected) : 0;
  const { currency: avgCurrency, amount: avgAmount } = splitRupiah(avgNominal);

  return (
    <section aria-labelledby="perolehan-infaq" className="flex flex-col gap-4">
      <div className="text-center">
        <h2 id="perolehan-infaq" className="text-sm font-semibold text-[#F4F1EA]/70">
          Total Perolehan Penjemputan
        </h2>
        <p className="mt-1 break-words tracking-tight text-[#F4F1EA]">
          <span className="align-middle text-lg font-bold text-[#F4F1EA]/70 md:text-xl">{currency} </span>
          <span className="text-5xl font-black md:text-6xl">{amount}</span>
        </p>
      </div>

      {/* Kaki huruf T: garis horizontal penuh + pembagi vertikal antar kolom */}
      <div className="border-t border-white/10" aria-hidden="true" />
      <div className="grid grid-cols-2 divide-x divide-white/10" role="list">
        <div className="px-4 text-center" role="listitem">
          <p className="text-xl font-black tracking-tight text-[#EAD19B] md:text-2xl">
            {Number(collected || 0).toLocaleString('id-ID')}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#F4F1EA]/60">
            Kaleng isi
          </p>
        </div>
        <div className="px-4 text-center" role="listitem">
          <p className="text-xl font-black tracking-tight text-[#EAD19B] md:text-2xl">
            <span className="align-middle text-xs font-bold text-[#EAD19B]/70 md:text-sm">{avgCurrency} </span>
            <span>{avgAmount}</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#F4F1EA]/60">
            Rata-rata per kaleng
          </p>
        </div>
      </div>
    </section>
  );
}

export default PerolehanHero;
