'use client';

import { useEffect, useState } from 'react';
import { Check, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { WorkQueueOfficer } from './types';

interface OfficerPickerSheetProps {
  open: boolean;
  officers: WorkQueueOfficer[];
  selectedId: string;
  onSelect: (officerId: string) => void;
  onClose: () => void;
}

export function OfficerPickerSheet({
  open,
  officers,
  selectedId,
  onSelect,
  onClose,
}: OfficerPickerSheetProps) {
  const [draftId, setDraftId] = useState(selectedId);

  useEffect(() => {
    if (!open) return;
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(() => setDraftId(selectedId));
  }, [open, selectedId]);

  return (
    <Modal isOpen={open} onClose={onClose} title="Pilih Petugas" variant="glass" position="bottom">
      <div className="space-y-4">
        {officers.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center">
            <Users size={22} className="mx-auto text-[#F4F1EA]/30" />
            <p className="mt-2 text-sm font-bold text-[#F4F1EA]">Belum ada petugas aktif</p>
            <p className="mt-1 text-xs text-[#F4F1EA]/50">
              Tambahkan petugas terlebih dahulu sebelum menugaskan kaleng.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {officers.map((officer) => {
              const selected = draftId === officer.id;
              return (
                <li key={officer.id}>
                  <button
                    type="button"
                    onClick={() => setDraftId(officer.id)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
                      selected
                        ? 'border-[#EAD19B]/60 bg-[#EAD19B]/10'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                        selected
                          ? 'border-[#EAD19B] bg-[#EAD19B] text-[#2C473E]'
                          : 'border-white/20 text-[#F4F1EA]/60'
                      }`}
                    >
                      {selected ? <Check size={16} /> : officer.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#F4F1EA]">
                        {officer.fullName}
                      </span>
                      <span className="block truncate text-[10px] font-medium text-[#F4F1EA]/50">
                        {officer.assignedCount} tugas · {officer.completedCount} selesai
                        {officer.dukuhName ? ` · ${officer.dukuhName}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-[#F4F1EA]/70 transition-all hover:bg-white/10 active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              if (draftId) onSelect(draftId);
              onClose();
            }}
            disabled={!draftId}
            className="h-11 flex-1 rounded-xl bg-[#EAD19B] text-xs font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95 disabled:opacity-40"
          >
            Simpan Pilihan
          </button>
        </div>
      </div>
    </Modal>
  );
}
