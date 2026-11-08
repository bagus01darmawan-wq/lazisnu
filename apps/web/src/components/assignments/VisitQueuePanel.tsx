'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, MapPin, RefreshCcw, Square } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  assignedVisitCans: number;
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
      <Card variant="glass" className="space-y-3 p-4 md:p-5">
        <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
        <div className="h-20 animate-pulse rounded-xl bg-white/5" />
      </Card>
    );
  }

  return (
    <Card variant="glass" className="space-y-4 p-4 md:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-[#EAD19B]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-[#F4F1EA]">
              Kunjungan Non-Aktif
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#F4F1EA]/50">
            Kaleng NON_AKTIF yang belum punya tugas kunjungan untuk periode ini.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          className="h-9 gap-2 rounded-xl border-white/10 bg-white/5 text-xs font-bold"
          isLoading={loading}
        >
          <RefreshCcw size={13} />
          Muat ulang
        </Button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-[#D97A76]">
          {error}
        </p>
      ) : !data || data.totalVisitCans === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-xs text-[#F4F1EA]/40">
          Belum ada kaleng non-aktif di wilayah ini.
        </p>
      ) : data.unassignedVisitCans === 0 ? (
        <p className="rounded-xl border border-[#1F8243]/20 bg-[#1F8243]/10 p-4 text-center text-xs text-[#1F8243]">
          Semua {data.totalVisitCans} kaleng non-aktif sudah punya tugas kunjungan periode ini.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[#F4F1EA]/60">
              Total {data.totalVisitCans}
            </span>
            <span className="rounded-full border border-[#1F8243]/20 bg-[#1F8243]/10 px-3 py-1 text-[#1F8243]">
              Sudah {data.assignedVisitCans}
            </span>
            <span className="rounded-full border border-[#EAD19B]/20 bg-[#EAD19B]/10 px-3 py-1 text-[#EAD19B]">
              Belum {data.unassignedVisitCans}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="flex items-center gap-2 text-[11px] font-bold text-[#F4F1EA]/60 hover:text-[#F4F1EA]"
            >
              {groups.length > 0 && groups.every((group) => selectedGroupIds.has(groupKey(group))) ? (
                <CheckSquare size={15} className="text-[#1F8243]" />
              ) : (
                <Square size={15} />
              )}
              Pilih semua grup
            </button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
              {selectedCanCount} kaleng dipilih
            </span>
          </div>

          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {groups.map((group) => {
              const key = groupKey(group);
              const selected = selectedGroupIds.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? 'border-[#EAD19B]/60 bg-[#EAD19B]/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#F4F1EA]">
                        {group.dukuhName}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#F4F1EA]/40">
                        {group.canIds.length} kaleng
                      </p>
                    </div>
                    {selected ? (
                      <CheckSquare size={15} className="shrink-0 text-[#1F8243]" />
                    ) : (
                      <Square size={15} className="shrink-0 text-[#F4F1EA]/30" />
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {group.cans.slice(0, 3).map((can) => (
                      <p key={can.id} className="truncate text-[10px] text-[#F4F1EA]/50">
                        {can.ownerName} · #{can.qrCode || '-'}
                        {can.rt || can.rw ? ` · RT ${can.rt || '-'}/RW ${can.rw || '-'}` : ''}
                      </p>
                    ))}
                    {group.cans.length > 3 && (
                      <p className="text-[10px] text-[#F4F1EA]/30">
                        +{group.cans.length - 3} lainnya
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <GlassSelect
                value={officerId}
                onChange={setOfficerId}
                label="Petugas kunjungan"
                placeholder="-- Pilih Petugas --"
                options={officers.map((officer) => ({
                  label: `${officer.fullName}${officer.employeeCode ? ` (${officer.employeeCode})` : ''}`,
                  value: officer.id,
                }))}
              />
            </div>
            <Button
              onClick={() => void assign()}
              disabled={!officerId || selectedGroupCount === 0}
              isLoading={submitting}
              className="h-11 rounded-xl bg-[#EAD19B] px-5 text-xs font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90"
            >
              Tugaskan Kunjungan ({selectedCanCount})
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
