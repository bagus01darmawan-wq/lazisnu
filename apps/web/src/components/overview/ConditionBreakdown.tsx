'use client';

import React from 'react';
import { AlertTriangle, Hexagon, Info } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  OverviewCanChangeCompletenessView,
  OverviewCanChangesByTaskPeriodView,
} from './overviewView';

interface ConditionBreakdownProps {
  changes: OverviewCanChangesByTaskPeriodView;
}

interface GroupItem {
  key: string;
  label: string;
  count: number;
  badgeClass: string;
}

const STATUS_ITEMS = [
  { key: 'AKTIF', label: 'Aktif', badgeClass: 'bg-[#1F8243]/15 text-[#1F8243] border-[#1F8243]/30' },
  { key: 'NON_AKTIF', label: 'Nonaktif', badgeClass: 'bg-[#F4F1EA]/10 text-[#F4F1EA]/70 border-[#F4F1EA]/20' },
  { key: 'DIKEMBALIKAN', label: 'Dikembalikan', badgeClass: 'bg-[#6B9E9F]/15 text-[#6B9E9F] border-[#6B9E9F]/30' },
] as const;

const PHYSICAL_ITEMS = [
  { key: 'BAIK', label: 'Baik', badgeClass: 'bg-[#1F8243]/15 text-[#1F8243] border-[#1F8243]/30' },
  { key: 'RUSAK', label: 'Rusak', badgeClass: 'bg-[#DE6F4A]/15 text-[#DE6F4A] border-[#DE6F4A]/30' },
  { key: 'HILANG', label: 'Hilang', badgeClass: 'bg-[#D97A76]/15 text-[#D97A76] border-[#D97A76]/30' },
] as const;

const COMPLETENESS_LABEL: Record<OverviewCanChangeCompletenessView, string> = {
  complete: 'Lengkap',
  partial: 'Parsial',
  unavailable: 'Riwayat tidak tersedia',
  provisional: 'Sementara',
};

function buildItems(
  config: ReadonlyArray<{ key: string; label: string; badgeClass: string }>,
  counts: Record<string, number>,
): GroupItem[] {
  return config.map((item) => ({
    ...item,
    count: Number(counts[item.key] ?? 0),
  }));
}

function formatSnapshotDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatPeriodLabel(period: { year: number; month: number }): string {
  return new Date(period.year, period.month - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

function GroupChart({
  title,
  items,
  headingId,
  completeness,
}: {
  title: string;
  items: GroupItem[];
  headingId: string;
  completeness: OverviewCanChangeCompletenessView;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const data = items.map((item) => ({ label: item.label, count: item.count }));
  const summary = items.map((item) => `${item.label} ${item.count}`).join(', ');

  return (
    <div>
      <h3 id={headingId} className="text-xs font-black uppercase tracking-widest text-[#EAD19B]">
        {title}
      </h3>
      {total === 0 ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-4 text-center text-xs font-semibold text-[#F4F1EA]/60">
          {completeness === 'complete'
            ? 'Tidak ada kaleng yang berubah pada periode ini'
            : 'Belum ada perubahan teratribusi pada periode ini'}
        </p>
      ) : (
        <>
          <div
            className="h-52"
            role="img"
            aria-label={`${title}: ${summary}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="70%">
                <PolarGrid stroke="rgba(244,241,234,0.12)" />
                <PolarAngleAxis
                  dataKey="label"
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

          <ul className="mt-1 flex flex-col gap-2" aria-label={`Rincian ${title.toLowerCase()}`}>
            {items.map((item) => {
              const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <li key={item.key} className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${item.badgeClass}`}>
                    {item.label}
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
    </div>
  );
}

/**
 * Kartu "Status & Kondisi Kaleng" — rekap kaleng unik yang BERUBAH pada
 * periode tugas terpilih, bukan posisi akhir periode. Status dan kondisi fisik
 * adalah dua kelompok independen; angkanya tidak dijumlahkan.
 */
export function ConditionBreakdown({ changes }: ConditionBreakdownProps) {
  const statusItems = buildItems(STATUS_ITEMS, changes.lifecycle.byCategory);
  const physicalItems = buildItems(PHYSICAL_ITEMS, changes.physicalCondition.byCategory);
  const coverageLabel = formatSnapshotDate(changes.coverageStart);
  const multiPeriod = changes.periods.length > 1;

  return (
    <section aria-labelledby="status-kondisi-kaleng" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="status-kondisi-kaleng" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
            <Hexagon size={16} className="text-[#6B9E9F]" aria-hidden="true" />
            Status &amp; Kondisi Kaleng
          </h2>
          <p className="mt-1 text-xs text-[#F4F1EA]/50">
            Jumlah kaleng yang mengalami perubahan terkait periode tugas terpilih.
            Termasuk perubahan manual yang periode tugasnya ditetapkan eksplisit.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            changes.completeness === 'complete'
              ? 'border-[#1F8243]/30 bg-[#1F8243]/15 text-[#1F8243]'
              : 'border-[#EAD19B]/30 bg-[#EAD19B]/10 text-[#EAD19B]'
          }`}
        >
          {COMPLETENESS_LABEL[changes.completeness]}
        </span>
      </div>

      {changes.completeness !== 'complete' && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl border border-[#EAD19B]/30 bg-[#EAD19B]/10 p-3 text-[11px] leading-relaxed text-[#EAD19B]"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {changes.completeness === 'unavailable' && (
              <>
                Riwayat perubahan periode ini tidak tersedia
                {coverageLabel ? ` sebelum ${coverageLabel}` : ''}. Angka nol di sini bukan
                berarti tidak ada kaleng yang berubah.
              </>
            )}
            {changes.completeness === 'partial' && (
              changes.unattributedEvents > 0 ? (
                <>
                  Sebagian perubahan belum memiliki atribusi periode tugas
                  {` (${changes.unattributedEvents.toLocaleString('id-ID')} event)`}
                  . Angka dapat bertambah setelah data lengkap; nol belum berarti terverifikasi.
                </>
              ) : (
                <>
                  Sebagian periode tugas berada sebelum atau melintasi awal pencatatan ledger
                  {coverageLabel ? ` (${coverageLabel})` : ''}. Angka periode tersebut belum
                  tentu lengkap.
                </>
              )
            )}
            {changes.completeness === 'provisional' && (
              <>
                Periode berjalan belum tuntas. Perubahan dari tugas yang belum selesai atau
                belum tersinkron dapat menambah angka ini.
              </>
            )}
          </span>
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <GroupChart
          title="Status Kaleng"
          items={statusItems}
          headingId="status-kaleng-heading"
          completeness={changes.completeness}
        />
        <GroupChart
          title="Kondisi Kaleng"
          items={physicalItems}
          headingId="kondisi-kaleng-heading"
          completeness={changes.completeness}
        />
      </div>

      {multiPeriod && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#F4F1EA]/40">
            Rincian per periode tugas
          </p>
          <ul className="mt-2 flex flex-col gap-1.5" aria-label="Rincian kaleng berubah per periode tugas">
            {changes.periods.map((period) => (
              <li key={period.period} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-bold text-[#F4F1EA]/70">
                  {formatPeriodLabel(period.taskPeriod)}
                </span>
                <span className="text-[#F4F1EA]/60">
                  Status {period.lifecycle.total} · Kondisi {period.physicalCondition.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-3 text-[11px] leading-relaxed text-[#F4F1EA]/70">
        <Info size={14} className="mt-0.5 shrink-0 text-[#6B9E9F]" aria-hidden="true" />
        <span>
          Status dan kondisi fisik adalah dua dimensi terpisah — satu kaleng dapat muncul
          di kedua kelompok, jadi angkanya tidak dijumlahkan. Untuk rentang beberapa bulan,
          angka adalah penjumlahan hasil tiap periode tugas; kaleng yang berubah di dua
          bulan dapat terhitung dua kali. Scope mengikuti pemilik kaleng saat ini, sehingga
          pemindahan kaleng dapat mengubah rekap periode lama.
        </span>
      </p>
    </section>
  );
}

export default ConditionBreakdown;
