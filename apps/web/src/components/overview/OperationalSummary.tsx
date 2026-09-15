'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Boxes, ClipboardCheck, Wallet } from 'lucide-react';
import type { OverviewSummary } from '@lazisnu/shared-types';
import { formatRupiah, taskClosedRate, taskProgressLabel, taskSupportLabel } from './format';

interface OperationalSummaryProps {
  summary: OverviewSummary;
  /** Filter ranting yang harus dibawa ke tautan drill-down (kosong untuk admin ranting). */
  branchId?: string;
}

interface CardSpec {
  key: string;
  label: string;
  value: string;
  support: string;
  definition: string;
  href: string;
  icon: React.ReactNode;
  accent: string;
}

/**
 * Empat ringkasan utama. Satu kartu = satu definisi; angka tidak dihitung ulang di sini.
 * Setiap kartu menyediakan tautan drill-down sehingga admin bisa langsung bertindak.
 */
export function OperationalSummary({ summary, branchId }: OperationalSummaryProps) {
  const branchQuery = branchId ? `&branch_id=${branchId}` : '';

  const cards: CardSpec[] = [
    {
      key: 'placement',
      label: 'Cakupan penempatan',
      value: String(summary.placement_coverage),
      support: `Aktif ${summary.active_cans} • Nonaktif ${summary.inactive_cans} • Rusak ${summary.damaged_cans}`,
      definition: 'Kaleng yang masih dilacak: aktif, nonaktif, dan rusak. Hilang dihitung terpisah.',
      href: `/dashboard/cans?status=AKTIF${branchQuery}`,
      icon: <Boxes size={20} aria-hidden="true" />,
      accent: '#1F8243',
    },
    {
      key: 'tasks',
      label: 'Tugas periode ini',
      value: `${taskClosedRate(summary)}%`,
      support: taskSupportLabel(summary),
      definition: `Ditutup = selesai + tidak terjemput. ${taskProgressLabel(summary)}.`,
      href: `/dashboard/assignments${branchId ? `?branch_id=${branchId}` : ''}`,
      icon: <ClipboardCheck size={20} aria-hidden="true" />,
      accent: '#6B9E9F',
    },
    {
      key: 'action',
      label: 'Perlu tindakan',
      value: String(summary.action_required),
      support: `Hilang ${summary.lost_cans} • Rusak ${summary.damaged_cans} • Nonaktif ${summary.inactive_cans}`,
      definition: 'Kaleng hilang, rusak, atau nonaktif yang menunggu keputusan admin.',
      href: `/dashboard/cans?status=HILANG${branchQuery}`,
      icon: <AlertTriangle size={20} aria-hidden="true" />,
      accent: '#D97A76',
    },
    {
      key: 'nominal',
      label: 'Infaq bulan ini',
      value: formatRupiah(summary.collection_nominal),
      support: `${summary.successful_collections} penjemputan berhasil • Dikembalikan bulan ini ${summary.returned_this_month}`,
      definition: 'Nominal dari penjemputan berhasil pada periode berjalan. Resubmit dihitung sekali (versi terbaru).',
      href: `/dashboard/collections${branchId ? `?branch_id=${branchId}` : ''}`,
      icon: <Wallet size={20} aria-hidden="true" />,
      accent: '#EAD19B',
    },
  ];

  return (
    <section aria-labelledby="ringkasan-operasional" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <h2 id="ringkasan-operasional" className="sr-only">
        Ringkasan operasional
      </h2>
      {cards.map((card) => (
        <Link
          key={card.key}
          href={card.href}
          className="group block rounded-2xl border border-white/5 bg-[var(--glass)] p-5 transition-[opacity,transform,color] duration-200 hover:border-white/15 active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4F1EA]/50">{card.label}</p>
              <p className="mt-1 break-words text-xl font-black text-[#F4F1EA] md:text-2xl">{card.value}</p>
            </div>
            <span
              className="rounded-xl p-3"
              style={{ backgroundColor: `${card.accent}1A`, color: card.accent }}
              aria-hidden="true"
            >
              {card.icon}
            </span>
          </div>
          <p className="mt-3 text-xs font-semibold text-[#F4F1EA]/70">{card.support}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#F4F1EA]/45">{card.definition}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#EAD19B]">
            Lihat rincian <ArrowUpRight size={12} aria-hidden="true" />
          </span>
        </Link>
      ))}
    </section>
  );
}

export default OperationalSummary;