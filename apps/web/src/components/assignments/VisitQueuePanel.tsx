'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Loader2,
  RefreshCcw,
  Square,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { GlassSelect } from '@/components/ui/GlassSelect';
import type { WorkQueueOfficer } from './types';

interface VisitQueueCan {
  id: string;
  qrCode: string | null;
  ownerName: string;
  dukuhId: string | null;
  dukuhName: string | null;
  rt: string | null;
  rw: string | null;
}

interface VisitQueueGroup {
  dukuhId: string | null;
  dukuhName: string;
  canIds: string[];
  cans: VisitQueueCan[];
}

interface VisitQueueData {
  period: { year: number; month: number };
  branchId: string;
  totalVisitCans: number;
  assignedPeriodCans: number;
  unassignedVisitCans: number;
  groups: VisitQueueGroup[];
  officers: { id: string; fullName: string; employeeCode: string }[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

interface VisitQueuePanelProps {
  branchId: string;
  dukuhId?: string;
  year: number;
  month: number;
  officers: WorkQueueOfficer[];
  onAssigned?: () => void;
}

export function VisitQueuePanel({
  branchId,
  dukuhId,
  year,
  month,
  officers,
  onAssigned,
}: VisitQueuePanelProps) {
  const [data, setData] = useState<VisitQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [officerId, setOfficerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await api.get('/admin/assignments/visit-queue', {
        params: {
          branch_id: branchId,
          year,
          month,
          ...(dukuhId ? { dukuh_id: dukuhId } : {}),
        },
      })) as unknown as ApiResponse<VisitQueueData>;
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error?.message || 'Gagal memuat antrean kunjungan');
      }
    } catch (err: unknown) {
      const message =
        (err as { error?: { message?: string }; message?: string })?.error?.message ||
        (err as { message?: string })?.message ||
        'Gagal memuat antrean kunjungan';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [branchId, dukuhId, year, month]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  // id grup memakai dukuhId; fallback dukuhName untuk "TANPA DUKUH".
  const groupKey = useCallback(
    (group: VisitQueueGroup) => group.dukuhId ?? `name:${group.dukuhName}`,
    [],
  );
  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupIds.has(groupKey(group))),
    [groups, selectedGroupIds, groupKey],
  );
  const selectedGroupCount = selectedGroupIds.size;
  const selectedCanCount = selectedGroups.reduce((sum, group) => sum + group.canIds.length, 0);
  const allGroupsSelected =
    groups.length > 0 && groups.every((group) => selectedGroupIds.has(groupKey(group)));
  const selectedOfficer = officers.find((officer) => officer.id === officerId) ?? null;
  const hasOfficers = officers.length > 0;

  const toggleGroup = (group: VisitQueueGroup) => {
    const key = groupKey(group);
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (groups.length > 0 && groups.every((group) => selectedGroupIds.has(groupKey(group)))) {
      setSelectedGroupIds(new Set());
      return;
    }
    setSelectedGroupIds(new Set(groups.map(groupKey)));
  };

  const assign = async () => {
    if (!data || !officerId || selectedGroupCount === 0) {
      toast.error('Pilih grup kunjungan dan petugas terlebih dahulu');
      return;
    }
    const canIds = Array.from(new Set(selectedGroups.flatMap((group) => group.canIds)));
    if (canIds.length === 0) return;

    setSubmitting(true);
    try {
      const response = (await api.post('/admin/assignments/bulk-cans', {
        officer_id: officerId,
        can_ids: canIds,
        kind: 'VISIT',
        period_year: year,
        period_month: month,
      })) as unknown as { success: boolean; assignedCount?: number; skippedCount?: number };
      toast.success(
        `${response.assignedCount ?? 0} kaleng non-aktif berhasil ditugaskan untuk kunjungan`,
      );
      setSelectedGroupIds(new Set());
      setOfficerId('');
      await load();
      onAssigned?.();
    } catch (err: unknown) {
      const message =
        (err as { error?: { message?: string }; message?: string })?.error?.message ||
        (err as { message?: string })?.message ||
        'Gagal menugaskan kunjungan';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3 md:px-5">
          <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-white/5" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/5"
      aria-label="Kunjungan kaleng non-aktif"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Kunjungan Non-Aktif
          </p>
          <p className="text-sm font-black text-[#F4F1EA]">
            {data ? `${data.unassignedVisitCans} kaleng · ${groups.length} grup` : 'Antrean kunjungan'}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-[#F4F1EA]/40">
            {data
              ? `${data.assignedPeriodCans} sudah dijadwalkan periode ini · ${data.totalVisitCans} total kaleng non-aktif`
              : 'Kaleng NON_AKTIF yang belum punya tugas kunjungan periode ini.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Muat ulang antrean kunjungan"
            className="flex h-9 items-center gap-2 rounded-2xl border border-[#F4F1EA]/20 bg-[#F4F1EA]/10 px-3 text-xs font-bold text-white/90 backdrop-blur-md transition-all duration-300 hover:bg-[#F4F1EA]/20 active:scale-95 disabled:opacity-50"
          >
            <RefreshCcw
              size={13}
              strokeWidth={3}
              className={`text-[#EAD19B] ${loading ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">Muat ulang</span>
          </button>
          <button
            type="button"
            onClick={selectAll}
            disabled={groups.length === 0}
            aria-label="Pilih semua grup"
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[11px] font-bold text-[#EAD19B] transition-all hover:bg-[#EAD19B]/10 active:scale-95 disabled:opacity-40"
          >
            {allGroupsSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            <span>Pilih semua</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-8 text-center">
          <AlertTriangle size={22} className="mx-auto text-[#DE6F4A]" />
          <p className="mt-2 text-sm font-bold text-[#F4F1EA]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 h-9 rounded-xl border border-[#EAD19B]/40 px-4 text-[11px] font-bold text-[#EAD19B] transition-all hover:bg-[#EAD19B]/10 active:scale-95"
          >
            Coba lagi
          </button>
        </div>
      ) : !data || data.totalVisitCans === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Belum ada kaleng non-aktif di wilayah ini
          </p>
        </div>
      ) : data.unassignedVisitCans === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-xs font-bold text-[#1F8243]">
            Semua {data.totalVisitCans} kaleng non-aktif sudah punya penugasan periode ini.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/5">
            {groups.map((group) => {
              const key = groupKey(group);
              const selected = selectedGroupIds.has(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-pressed={selected}
                    className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors md:px-5 ${
                      selected ? 'bg-[#EAD19B]/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        selected
                          ? 'border-[#EAD19B] bg-[#EAD19B] text-[#2C473E]'
                          : 'border-white/15 bg-white/5 text-[#F4F1EA]/30'
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-[#F4F1EA]">
                          {group.dukuhName}
                        </span>
                        <span className="shrink-0 text-[11px] font-black text-[#EAD19B]">
                          {group.canIds.length} kaleng
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#F4F1EA]/30">
                          DUKUH
                        </span>
                        <span className="text-[10px] font-bold text-[#F4F1EA]/40">
                          Kunjungan verifikasi
                        </span>
                      </span>
                      <span className="mt-1 block space-y-0.5">
                        {group.cans.slice(0, 2).map((can) => (
                          <span key={can.id} className="block truncate text-[10px] text-[#F4F1EA]/50">
                            {can.ownerName} · #{can.qrCode || '-'}
                            {can.rt || can.rw
                              ? ` · RT ${can.rt || '-'}/RW ${can.rw || '-'}`
                              : ''}
                          </span>
                        ))}
                        {group.cans.length > 2 && (
                          <span className="block text-[10px] text-[#F4F1EA]/30">
                            +{group.cans.length - 2} lainnya
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded-b-2xl border-t border-white/10 bg-[#2C473E]/90 px-4 py-3 md:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0" aria-live="polite">
                <p className="text-[11px] font-bold text-[#F4F1EA]">
                  {selectedGroupCount > 0
                    ? `${selectedCanCount} kaleng · ${selectedGroupCount} grup dipilih`
                    : 'Pilih grup untuk mulai menugaskan'}
                </p>
                <p className="truncate text-[10px] font-medium text-[#F4F1EA]/50">
                  {!hasOfficers
                    ? 'Belum ada petugas aktif di wilayah ini'
                    : selectedOfficer
                      ? `${selectedOfficer.fullName} · petugas kunjungan`
                      : 'Pilih petugas tujuan'}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="w-full sm:w-[220px]">
                  <GlassSelect
                    value={officerId}
                    onChange={setOfficerId}
                    placeholder="Pilih petugas"
                    disabled={!hasOfficers}
                    options={officers.map((officer) => ({
                      label: `${officer.fullName}${officer.employeeCode ? ` (${officer.employeeCode})` : ''}`,
                      value: officer.id,
                    }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void assign()}
                  disabled={!officerId || selectedGroupCount === 0 || submitting}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#EAD19B] px-4 text-[11px] font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  {selectedCanCount > 0 ? `Tugaskan ${selectedCanCount} Kaleng` : 'Tugaskan'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
