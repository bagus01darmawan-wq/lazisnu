'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { RegionCards } from '@/components/region/RegionCards';
import { useOperationalPeriod } from '@/hooks/useOperationalPeriod';

/**
 * LAYER 1 — daftar kartu wilayah (pola list users/page.tsx).
 * Klik kartu → pindah route ke halaman detail `/dashboard/assignments/[id]`
 * (pola detail users/[id]/page.tsx), bukan tabel di halaman yang sama.
 */
export default function AssignmentsPage() {
  const router = useRouter();
  const now = new Date();
  // Periode tampilan berbasis aksi: penugasan mengikuti periode yang belum
  // tuntas, bukan bulan kalender.
  const { displayYear, displayMonth } = useOperationalPeriod();
  const year = displayYear ?? now.getFullYear();
  const month = displayMonth ?? now.getMonth() + 1;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Penugasan Rutin</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Pilih wilayah untuk mengelola penugasan</p>
          </div>
        </div>
      </div>

      {/* Kartu wilayah — klik beralih halaman ke detail */}
      <RegionCards
        page="assignments"
        year={year}
        month={month}
        selectedId={null}
        onSelect={(r) => {
          const params = new URLSearchParams({
            kind: r.kind,
            name: r.name,
            branch: r.branchName ?? '',
            year: String(year),
            month: String(month),
          });
          router.push(`/dashboard/assignments/${r.id}?${params.toString()}`);
        }}
      />
    </div>
  );
}
