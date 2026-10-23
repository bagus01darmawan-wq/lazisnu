'use client';

import { CheckCircle2, ChevronDown, Loader2, UserCheck } from 'lucide-react';
import type { WorkQueueOfficer } from './types';

interface AssignmentActionBarProps {
  selectedGroups: number;
  selectedCans: number;
  officer: WorkQueueOfficer | null;
  hasOfficers: boolean;
  submitting: boolean;
  onOpenOfficer: () => void;
  onSubmit: () => void;
}

export function AssignmentActionBar({
  selectedGroups,
  selectedCans,
  officer,
  hasOfficers,
  submitting,
  onOpenOfficer,
  onSubmit,
}: AssignmentActionBarProps) {
  const canSubmit = selectedGroups > 0 && !!officer && hasOfficers && !submitting;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#2C473E]/95 px-4 py-3 backdrop-blur-xl lg:static lg:rounded-2xl lg:border lg:px-5"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0" aria-live="polite">
          <p className="text-[11px] font-bold text-[#F4F1EA]">
            {selectedGroups > 0
              ? `${selectedCans} kaleng · ${selectedGroups} grup dipilih`
              : 'Pilih grup untuk mulai menugaskan'}
          </p>
          <p className="truncate text-[10px] font-medium text-[#F4F1EA]/50">
            {!hasOfficers
              ? 'Belum ada petugas aktif di wilayah ini'
              : officer
                ? `${officer.fullName} · ${officer.assignedCount} tugas bulan ini`
                : 'Pilih petugas tujuan'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenOfficer}
            disabled={!hasOfficers}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-[#F4F1EA] transition-all hover:bg-white/10 active:scale-95 disabled:opacity-40 lg:flex-none lg:min-w-[200px]"
          >
            <UserCheck size={14} className="shrink-0 text-[#EAD19B]" />
            <span className="truncate">{officer ? officer.fullName : 'Pilih petugas'}</span>
            <ChevronDown size={14} className="ml-auto shrink-0 text-[#F4F1EA]/40" />
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#EAD19B] px-4 text-[11px] font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 lg:flex-none"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {selectedCans > 0 ? `Tugaskan ${selectedCans} Kaleng` : 'Tugaskan'}
          </button>
        </div>
      </div>
    </div>
  );
}
