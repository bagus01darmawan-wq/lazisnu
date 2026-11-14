'use client';

import React from 'react';
import { AlertTriangle, Hexagon } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { OverviewCanStateSnapshotView } from './overviewView';

interface ConditionBreakdownProps {
  snapshot: OverviewCanStateSnapshotView;
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

function GroupChart({ title, items, headingId }: { title: string; items: GroupItem[]; headingId: string }) {
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
          Belum ada data pada kelompok ini
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
 * Kartu "Status & Kondisi Kaleng" — dua kelompok independen.
 * Satu kaleng dapat muncul sekali di masing-masing kelompok; angka tidak
 * dijumlahkan sebagai total kaleng. Persentase dihitung di dalam kelompoknya.
 */
export function ConditionBreakdown({ snapshot }: ConditionBreakdownProps) {
  const statusItems = buildItems(STATUS_ITEMS, snapshot.status);
  const physicalItems = buildItems(PHYSICAL_ITEMS, snapshot.physicalCondition);
  const cutoverLabel = formatSnapshotDate(snapshot.cutoverAt);

  return (
    <section aria-labelledby="status-kondisi-kaleng" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <h2 id="status-kondisi-kaleng" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
        <Hexagon size={16} className="text-[#6B9E9F]" aria-hidden="true" />
        Status &amp; Kondisi Kaleng
      </h2>
      <p className="mt-1 text-xs text-[#F4F1EA]/50">
        Posisi pada akhir periode filter. Status dan kondisi fisik adalah dua dimensi
        terpisah — satu kaleng muncul di kedua kelompok, jadi angkanya tidak dijumlahkan.
      </p>

      {!snapshot.historyComplete && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl border border-[#EAD19B]/30 bg-[#EAD19B]/10 p-3 text-[11px] leading-relaxed text-[#EAD19B]"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Riwayat status belum lengkap
            {cutoverLabel ? ` sebelum ${cutoverLabel}` : ''}. Angka periode ini tidak dapat
            dipastikan dan tidak boleh dibaca sebagai snapshot historis yang akurat.
          </span>
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <GroupChart title="Status Kaleng" items={statusItems} headingId="status-kaleng-heading" />
        <GroupChart title="Kondisi Kaleng" items={physicalItems} headingId="kondisi-kaleng-heading" />
      </div>

      {snapshot.assumptionBaik > 0 && (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-3 text-[11px] leading-relaxed text-[#F4F1EA]/70">
          {snapshot.assumptionBaik.toLocaleString('id-ID')} kondisi Baik berasal dari asumsi
          backfill (riwayat lama tidak membuktikan kondisi fisik), bukan hasil observasi lapangan.
        </p>
      )}
    </section>
  );
}

export default ConditionBreakdown;
