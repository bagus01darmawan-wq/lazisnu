'use client';

import { AlertTriangle, CheckSquare, Square } from 'lucide-react';
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
  const totalUnassigned = groups.reduce((sum, group) => sum + group.unassignedCans, 0);
  const allSelected = groups.length > 0 && groups.every((group) => selectedIds.has(group.id));

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
            return (
              <li key={group.id}>
                <label
                  className={`flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors md:px-5 ${
                    selected ? 'bg-[#EAD19B]/10' : 'hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => onToggle(group.id)}
                  />
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
