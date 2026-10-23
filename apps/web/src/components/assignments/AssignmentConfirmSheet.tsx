'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MONTH_NAMES, type WorkQueueOfficer } from './types';

interface AssignmentConfirmSheetProps {
  open: boolean;
  regionName: string;
  year: number;
  month: number;
  groupCount: number;
  canCount: number;
  officer: WorkQueueOfficer | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function AssignmentConfirmSheet({
  open,
  regionName,
  year,
  month,
  groupCount,
  canCount,
  officer,
  submitting,
  onConfirm,
  onClose,
}: AssignmentConfirmSheetProps) {
  const rows = [
    { label: 'Wilayah', value: regionName },
    { label: 'Periode', value: `${MONTH_NAMES[month - 1]} ${year}` },
    { label: 'Grup', value: `${groupCount} dipilih` },
    { label: 'Kaleng', value: `${canCount}` },
    { label: 'Petugas', value: officer?.fullName ?? '-' },
  ];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Konfirmasi Penugasan"
      variant="glass"
      position="bottom"
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
                {row.label}
              </span>
              <span className="truncate text-xs font-bold text-[#F4F1EA]">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[#1F8243]/25 bg-[#1F8243]/10 px-3 py-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#1F8243]" />
          <p className="text-[11px] leading-relaxed text-[#F4F1EA]/60">
            Kaleng yang sudah punya jadwal pada periode ini akan dilewati otomatis, jadi tidak
            ada penugasan ganda.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-[#F4F1EA]/70 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || canCount === 0 || !officer}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#EAD19B] text-xs font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95 disabled:opacity-40"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Tugaskan {canCount} Kaleng
          </button>
        </div>
      </div>
    </Modal>
  );
}
