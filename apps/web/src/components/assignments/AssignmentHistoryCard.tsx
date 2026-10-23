'use client';

import { Calendar, MapPin, Repeat, Trash2, UserCheck } from 'lucide-react';
import { MONTH_NAMES, statusLabel, statusStyle, type AssignmentHistoryItem } from './types';

interface AssignmentHistoryCardProps {
  item: AssignmentHistoryItem;
  canDelete: boolean;
  onTransfer: (item: AssignmentHistoryItem) => void;
  onDelete: (id: string) => void;
}

export function AssignmentHistoryCard({
  item,
  canDelete,
  onTransfer,
  onDelete,
}: AssignmentHistoryCardProps) {
  const location = [
    item.can.dukuhName || item.can.dukuh,
    item.can.rt || item.can.rw
      ? `RT ${item.can.rt || '-'} / RW ${item.can.rw || '-'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-[#F4F1EA]">{item.can.ownerName}</h3>
          <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-[#EAD19B]/60">
            #{item.can.qrCode}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusStyle(
            item.status
          )}`}
        >
          {statusLabel(item.status)}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-[#F4F1EA]/60">
        {location && (
          <p className="flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0 text-[#F4F1EA]/30" />
            <span className="truncate">{location}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <UserCheck size={11} className="shrink-0 text-[#F4F1EA]/30" />
          <span className="truncate">{item.officer.fullName}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <Calendar size={11} className="shrink-0 text-[#F4F1EA]/30" />
          {MONTH_NAMES[item.periodMonth - 1]} {item.periodYear}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          type="button"
          disabled={item.status !== 'ACTIVE'}
          onClick={() => onTransfer(item)}
          title={
            item.status === 'ACTIVE'
              ? 'Transfer penugasan'
              : 'Hanya penugasan aktif yang dapat ditransfer'
          }
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-[#F4F1EA]/70 transition-all hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Repeat size={12} className="text-[#EAD19B]" />
          Transfer
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D97A76]/20 bg-[#D97A76]/5 text-[10px] font-bold text-[#D97A76] transition-all hover:bg-[#D97A76]/10 active:scale-95"
          >
            <Trash2 size={12} />
            Hapus
          </button>
        )}
      </div>
    </article>
  );
}
