'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckSquare, ChevronDown, Square } from 'lucide-react';
import type { WorkQueueGroup } from './types';

interface UnassignedQueueProps {
  groups: WorkQueueGroup[];
  selectedIds: Set<string>;
  onToggle: (groupId: string) => void;
  onToggleAll: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const CONDITION_STYLES: Record<string, string> = {
  AKTIF: 'border-[#1F8243]/30 bg-[#1F8243]/10 text-[#1F8243]',
  RUSAK: 'border-[#DE6F4A]/30 bg-[#DE6F4A]/10 text-[#DE6F4A]',
  HILANG: 'border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]',
};

function conditionStyle(condition: string) {
  return CONDITION_STYLES[condition] ?? 'border-white/15 bg-white/5 text-[#F4F1EA]/60';
}

function groupMeta(group: WorkQueueGroup) {
  if (group.kind === 'dukuh') return 'DUKUH';
  if (group.kind === 'rt') return 'RT / RW';
  return 'KALENG';
}

export function UnassignedQueue({
  groups,
  selectedIds,
  onToggle,
  onToggleAll,
  loading,
  error,
  onRetry,
}: UnassignedQueueProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const totalUnassigned = groups.reduce((sum, group) => sum + group.unassignedCans, 0);
  const allSelected = groups.length > 0 && groups.every((group) => selectedIds.has(group.id));

  // Prune grup yang hilang setelah refetch/ganti periode.
  useEffect(() => {
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(() => {
      setExpandedIds((previous) => {
        const validIds = new Set(groups.map((group) => group.id));
        const next = new Set(Array.from(previous).filter((id) => validIds.has(id)));
        return next.size === previous.size ? previous : next;
      });
    });
  }, [groups]);

  const toggleExpanded = (groupId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
        <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-[#DE6F4A]/30 bg-[#DE6F4A]/5 p-6 text-center">
        <AlertTriangle size={22} className="mx-auto text-[#DE6F4A]" />
        <p className="mt-2 text-sm font-bold text-[#F4F1EA]">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-9 rounded-xl border border-[#EAD19B]/40 px-4 text-[11px] font-bold text-[#EAD19B] transition-all hover:bg-[#EAD19B]/10 active:scale-95"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/5"
      aria-label="Daftar wilayah yang belum ditugaskan"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Belum ditugaskan
          </p>
          <p className="text-sm font-black text-[#F4F1EA]">
            {totalUnassigned} kaleng · {groups.length} grup
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          disabled={groups.length === 0}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[11px] font-bold text-[#EAD19B] transition-all hover:bg-[#EAD19B]/10 active:scale-95 disabled:opacity-40"
        >
          {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          Pilih semua
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Tidak ada grup yang tersisa
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {groups.map((group) => {
            const selected = selectedIds.has(group.id);
            const pct =
              group.totalCans === 0
                ? 0
                : Math.round((group.assignedCans / group.totalCans) * 100);
            const cans = group.cans ?? [];
            const hasCans = cans.length > 0;
            // Grup RT selalu diberi tombol agar backend lama menampilkan
            // "Rincian belum tersedia", bukan panel yang diam-diam kosong.
            const canShowDetails = hasCans || group.kind === 'rt';
            const expanded = expandedIds.has(group.id);
            const checkboxId = `queue-group-${group.id}`;
            const panelId = `queue-detail-${group.id}`;
            return (
              <li key={group.id}>
                <div
                  className={`flex min-h-16 items-center gap-2 pr-3 transition-colors md:pr-4 ${
                    selected ? 'bg-[#EAD19B]/10' : 'hover:bg-white/5'
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => onToggle(group.id)}
                  />
                  <label
                    htmlFor={checkboxId}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 md:px-5"
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
                          {group.name}
                        </span>
                        <span className="shrink-0 text-[11px] font-black text-[#EAD19B]">
                          {group.unassignedCans} belum
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#F4F1EA]/30">
                          {groupMeta(group)}
                        </span>
                        <span className="text-[10px] font-bold text-[#F4F1EA]/40">
                          {group.assignedCans}/{group.totalCans}
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full bg-[#1F8243]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                  </label>

                  {canShowDetails ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.id)}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      aria-label={`Lihat ${group.unassignedCans} kaleng`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#EAD19B]/70 transition-all hover:bg-[#EAD19B]/10 hover:text-[#EAD19B] active:scale-95"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  <div id={panelId} className="border-t border-white/5 px-4 pb-3 md:px-5">
                    {hasCans ? (
                      <ul
                        className="max-h-64 divide-y divide-white/5 overflow-y-auto"
                        aria-label={`Kaleng di ${group.name}`}
                      >
                        {cans.map((can) => (
                          <li key={can.id} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[11px] font-bold text-[#EAD19B]">
                                {can.qrCode || '—'}
                              </p>
                              <p className="truncate text-xs text-[#F4F1EA]/70">{can.ownerName}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${conditionStyle(can.condition)}`}
                            >
                              {can.condition.replace('_', ' ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-3 text-xs font-bold text-[#F4F1EA]/40">
                        Rincian belum tersedia
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
