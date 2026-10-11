'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { RegionCards } from '@/components/region/RegionCards';

/**
 * LAYER 1 — daftar kartu wilayah (pola list users/page.tsx).
 * Klik kartu → pindah route ke halaman detail `/dashboard/assignments/[id]`
 * (pola detail users/[id]/page.tsx), bukan tabel di halaman yang sama.
 */
export default function AssignmentsPage() {
  const router = useRouter();
  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Penugasan Rutin</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Pilih wilayah untuk melihat penugasan</p>
          </div>
        </div>
      </div>

      {/* Kartu wilayah — klik beralih halaman ke detail */}
      <RegionCards
        page="assignments"
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        selectedId={null}
        onSelect={(r) => {
          const params = new URLSearchParams({
            kind: r.kind,
            name: r.name,
            branch: r.branchName ?? '',
          });
          router.push(`/dashboard/assignments/${r.id}?${params.toString()}`);
        }}
      />
    </div>
  );
}
