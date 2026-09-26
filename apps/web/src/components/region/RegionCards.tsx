'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Loader2, MapPin, Users } from 'lucide-react';
import api from '@/lib/api';
import { cleanBranchName } from '@/lib/formatters';
import { Card } from '@/components/ui/Card';

export interface RegionOfficer {
  id: string;
  name: string;
  employeeCode: string;
  isActive: boolean;
}

export interface RegionSummary {
  kind: 'branch' | 'dukuh';
  isFallback: boolean;
  id: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  /** Jumlah kaleng di wilayah ini. Angka utama di halaman Kelola Kaleng. */
  total: number;
  /**
   * Jumlah baris penugasan pada periode ini. Angka utama di halaman
   * Assignments, ditampilkan sebagai baris kedua di halaman Kaleng.
   */
  assignmentTotal: number;
  breakdown: Record<string, number>;
  nonActive: number;
  assigned: number;
  unassigned: number;
  completed: number;
  uncollected: number;
  officerCount: number;
  activeOfficerCount: number;
  unmappedOfficerCount: number;
  officers: RegionOfficer[];
}

export interface RegionCardResponse {
  scope: 'branch' | 'dukuh';
  period: { year: number; month: number } | null;
  /**
   * Petugas yang belum punya relasi Dukuh. Ditampilkan sebagai catatan
   * terpisah, bukan ditempel ke salah satu kartu — kita tidak tahudukuh
   * mana yang benar untuk mereka.
   */
  unmappedOfficerCount: number;
  regions: RegionSummary[];
}

const MONTH_LABEL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface RegionCardsProps {
  /** `cans` atau `assignments` — menentukan endpoint. */
  page: 'cans' | 'assignments';
  /** Periode aktif; kartu mengikuti nilai ini (keputusan 3). */
  year: number;
  month: number;
  /** Kartu yang sedang dibuka; dipakai untuk menandai kartu aktif. */
  selectedId: string | null;
  onSelect: (region: RegionSummary) => void;
  /** Layer kartu disembunyikan total bila role punya satu wilayah. */
  hidden?: boolean;
}

export function RegionCards({
  page,
  year,
  month,
  selectedId,
  onSelect,
  hidden,
}: RegionCardsProps) {
  // Kunci permintaan disatukan dengan data yang sudah termuat. `loading` dibaca
  // saat render, jadi kita tidak perlu setState di dalam effect (dan tidak
  // memicu render berantai).
  const key = `${page}|${year}|${month}`;
  const [result, setResult] = useState<{ key: string; data: RegionCardResponse | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = result?.key !== key;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/admin/${page}/region-cards`, {
          params: { year: String(year), month: String(month) },
        }) as unknown as { success: boolean; data: RegionCardResponse };
        if (cancelled) return;
        setError(null);
        setResult({ key, data: res?.success ? res.data : null });
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message || 'Gagal memuat ringkasan wilayah');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, year, month, key]);

  if (hidden) return null;

  const data = result?.key === key ? result.data : null;

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[148px] rounded-2xl bg-white/5 border border-white/10 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="glass" className="p-0 border-white/5">
        <div className="flex items-center gap-3 px-5 py-4 text-xs font-bold text-[#DE6F4A]">
          <AlertTriangle size={16} />
          {error}
        </div>
      </Card>
    );
  }

  const regions = data?.regions ?? [];
  const unmapped = data?.unmappedOfficerCount ?? 0;

  if (regions.length === 0) {
    return (
      <Card variant="glass" className="p-0 border-white/5">
        <div className="px-5 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Tidak ada wilayah untuk ditampilkan
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-[#EAD19B]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#F4F1EA]/50">
            Pilih {data?.scope === 'dukuh' ? 'Dukuh' : 'Ranting'}
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/30">
          {MONTH_LABEL[month - 1]} {year}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {regions.map((r) => (
          <RegionCard
            key={r.id}
            region={r}
            page={page}
            active={r.id === selectedId}
            showOfficers={page === 'assignments'}
            onSelect={onSelect}
          />
        ))}
      </div>

      {unmapped > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#EAD19B]/20 bg-[#EAD19B]/5 px-4 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#EAD19B]" />
          <p className="text-[11px] leading-relaxed text-[#F4F1EA]/60">
            <span className="font-bold text-[#EAD19B]">{unmapped} petugas</span>{' '}
            belum dipetakan ke Dukuh mana pun, jadi tidak muncul di kartu mana pun.
            Petugas ini perlu ditugaskan manual — sistem tidak menebaknya.
          </p>
        </div>
      )}
    </div>
  );
}

function RegionCard({
  region,
  page,
  active,
  showOfficers,
  onSelect,
}: {
  region: RegionSummary;
  page: 'cans' | 'assignments';
  active: boolean;
  showOfficers: boolean;
  onSelect: (r: RegionSummary) => void;
}) {
  // Angka utama mengikuti halaman: penugasan di Assignments, kaleng di Kaleng.
  // Bar progres ikut halaman yang sama supaya tidak ada dua angka "64" yang
  // berarti berbeda dalam satu kartu.
  const isAssignments = page === 'assignments';
  const headline = isAssignments ? region.assignmentTotal : region.total;
  const barPct = isAssignments
    ? region.assignmentTotal === 0
      ? 0
      : Math.round((region.completed / region.assignmentTotal) * 100)
    : region.total === 0
      ? 0
      : Math.round((region.assigned / region.total) * 100);
  const barLabel = isAssignments ? 'penugasan selesai' : 'ter-alokasi';
  const barValue = isAssignments
    ? `${region.completed}/${region.assignmentTotal}`
    : `${region.assigned}/${region.total}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(region)}
      aria-current={active}
      className={[
        'text-left rounded-2xl p-5 flex flex-col gap-3 transition-all duration-300',
        'bg-[var(--glass)] backdrop-blur-2xl border shadow-[0_20px_50px_rgba(0,0,0,0.3)]',
        active
          ? 'border-[#EAD19B]/50 ring-1 ring-[#EAD19B]/30'
          : 'border-[var(--border)] hover:border-[#EAD19B]/30 hover:-translate-y-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]/50',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-tight text-[#F4F1EA] truncate">
            {cleanBranchName(region.name).toUpperCase()}
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#EAD19B]/60 mt-0.5">
            {region.isFallback
              ? 'TANPA DATA DUKUH'
              : region.kind === 'dukuh' && region.branchName
                ? cleanBranchName(region.branchName).toUpperCase()
                : region.branchCode || 'RANTING'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="px-2.5 h-7 flex items-center bg-[#EAD19B]/10 rounded-lg">
            <span className="text-[11px] font-black text-[#EAD19B]">{headline}</span>
          </div>
          <ChevronRight
            size={16}
            className={`text-[#F4F1EA]/30 transition-transform ${active ? 'rotate-90' : ''}`}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight text-[#F4F1EA]/40 mb-1.5">
          <span>{barLabel}</span>
          <span>{barValue}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1F8243] transition-all duration-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-tight">
        <span className="text-[#F4F1EA]/40">
          {isAssignments ? 'kaleng' : 'penugasan'}{' '}
          <span className="text-[#F4F1EA]/80">
            {isAssignments ? region.total : region.assignmentTotal}
          </span>
        </span>
        <span className="text-[#F4F1EA]/40">
          {isAssignments ? 'belum ditugaskan' : 'belum'}{' '}
          <span className="text-[#F4F1EA]/80">{region.unassigned}</span>
        </span>
        {region.nonActive > 0 && (
          <span className="text-[#F4F1EA]/40">
            non-aktif <span className="text-[#DE6F4A]">{region.nonActive}</span>
          </span>
        )}
        {region.uncollected > 0 && (
          <span className="text-[#F4F1EA]/40">
            terlewat <span className="text-[#EAD19B]">{region.uncollected}</span>
          </span>
        )}
        {region.completed > 0 && (
          <span className="text-[#F4F1EA]/40">
            selesai <span className="text-[#1F8243]">{region.completed}</span>
          </span>
        )}
      </div>

      {showOfficers && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={11} className="text-[#F4F1EA]/30" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/30">
              Petugas ({region.activeOfficerCount}/{region.officerCount})
            </span>
          </div>
          {region.officers.length === 0 ? (
            <p className="text-[10px] font-bold uppercase tracking-tight text-[#DE6F4A]/70">
              belum ada petugas
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {region.officers.slice(0, 3).map((o) => (
                <li
                  key={o.id}
                  className="text-[11px] font-medium text-[#F4F1EA]/60 truncate"
                >
                  {o.name}
                  {!o.isActive && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase text-[#F4F1EA]/30">
                      non-aktif
                    </span>
                  )}
                </li>
              ))}
              {region.officers.length > 3 && (
                <li className="text-[10px] font-bold uppercase tracking-tight text-[#F4F1EA]/30">
                  +{region.officers.length - 3} lainnya
                </li>
              )}
            </ul>
          )}
          {region.unmappedOfficerCount > 0 && (
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-tight text-[#EAD19B]/60">
              {region.unmappedOfficerCount} petugas belum dipetakan
            </p>
          )}
        </div>
      )}
    </button>
  );
}

export { Loader2 };
