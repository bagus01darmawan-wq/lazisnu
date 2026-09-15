'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react';
import type { CanCondition, OverviewActionItem } from '@lazisnu/shared-types';
import { CONDITION_BADGE_CLASS, CONDITION_LABEL, formatCaseAge } from './format';

interface ActionRequiredListProps {
  items: OverviewActionItem[];
  /** Filter ranting yang harus dibawa ke tautan drill-down (kosong untuk admin ranting). */
  branchId?: string;
  loading?: boolean;
}

type ConditionTab = 'ALL' | 'HILANG' | 'RUSAK' | 'NON_AKTIF';

const TABS: Array<{ key: ConditionTab; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'HILANG', label: 'Hilang' },
  { key: 'RUSAK', label: 'Rusak' },
  { key: 'NON_AKTIF', label: 'Nonaktif' },
];

/**
 * Daftar "perlu tindakan sekarang". Tab memfilter daftar yang SUDAH dihitung server
 * (server membatasi jumlah item), jadi tab tidak menambah definisi baru.
 * Target sentuh minimum 44px dan jarak antar target minimal 8px (mobile-first).
 */
export function ActionRequiredList({ items, branchId, loading = false }: ActionRequiredListProps) {
  const [tab, setTab] = React.useState<ConditionTab>('ALL');

  const filtered = React.useMemo(
    () => (tab === 'ALL' ? items : items.filter((item) => item.condition === tab)),
    [items, tab],
  );

  const branchQuery = branchId ? `&branch_id=${branchId}` : '';

  return (
    <section aria-labelledby="perlu-tindakan" className="rounded-2xl border border-white/5 bg-[var(--glass)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="perlu-tindakan" className="flex items-center gap-2 text-sm font-bold text-[#F4F1EA]">
          <AlertTriangle size={16} className="text-[#D97A76]" aria-hidden="true" />
          Perlu tindakan sekarang
        </h2>
        <Link
          href={`/dashboard/cans?status=HILANG${branchQuery}`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold text-[#EAD19B] underline-offset-4 transition-[opacity,color] duration-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
        >
          Lihat semua
        </Link>
      </div>

      <div role="tablist" aria-label="Filter kondisi" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-bold transition-[background-color,color,transform] duration-200 active:scale-[.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B] ${
              tab === t.key
                ? 'bg-[#1F8243] text-white'
                : 'border border-white/10 bg-[#F4F1EA]/5 text-[#F4F1EA]/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#F4F1EA]/5 p-5 text-center">
          <CheckCircle2 size={20} className="mx-auto text-[#1F8243]" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-[#F4F1EA]">Tidak ada kaleng yang perlu ditindak saat ini</p>
          <Link
            href={`/dashboard/cans${branchId ? `?branch_id=${branchId}` : ''}`}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#F4F1EA]/10 px-4 text-xs font-bold text-[#F4F1EA] transition-[opacity] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
          >
            Buka daftar kaleng
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtered.map((item) => (
            <li key={`${item.can_id}-${item.proposal_id ?? 'plain'}`}>
              <Link
                href={`/dashboard/cans/${item.can_id}${branchQuery ? `?branch_id=${branchId}` : ''}`}
                className="block rounded-xl border border-white/5 bg-[#F4F1EA]/5 p-4 transition-[opacity,transform] duration-200 active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${CONDITION_BADGE_CLASS[item.condition as CanCondition]}`}
                  >
                    {CONDITION_LABEL[item.condition as CanCondition]}
                  </span>
                  <span className="text-sm font-bold text-[#F4F1EA]">{item.owner_name}</span>
                  <span className="text-xs text-[#F4F1EA]/50">{item.branch_name}</span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#F4F1EA]/60">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList size={12} aria-hidden="true" />
                    {item.action_label}
                  </span>
                  <span>Kasus berjalan {formatCaseAge(item.since)}</span>
                  {item.reason_code && <span>Alasan: {item.reason_code}</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {loading && <p className="mt-3 text-xs text-[#F4F1EA]/50">Memperbarui daftar…</p>}
    </section>
  );
}

export default ActionRequiredList;