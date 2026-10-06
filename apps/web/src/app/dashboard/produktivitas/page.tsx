'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { ArrowLeft, ChevronLeft, ChevronRight, UserCheck, Users } from 'lucide-react';
import type { ApiResponse } from '@lazisnu/shared-types';
import { MONTH_NAMES_ID } from '@/components/overview/format';

/** Baris produktivitas di sisi web (camelCase — hasil normalisasi caseConverter). */
interface ProductivityOfficerRow {
  officerId: string;
  fullName: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  assigned: number;
  collected: number;
  filled: number;
  uncollected: number;
}

interface ProductivityOfficersView {
  scope: { branchName?: string };
  period: unknown;
  officers: ProductivityOfficerRow[];
}

interface PageQuery {
  kind?: string;
  [key: string]: string | string[] | undefined;
}

function periodLabel(year: number, months: number[]): string {
  const clean = [...new Set(months)].sort((a, b) => a - b);
  if (clean.length === 0) return String(year);
  if (clean.length === 1) return `${MONTH_NAMES_ID[clean[0] - 1]} ${year}`;
  const contiguous = clean.every((m, i) => i === 0 || m === clean[i - 1] + 1);
  if (contiguous) return `${MONTH_NAMES_ID[clean[0] - 1]}–${MONTH_NAMES_ID[clean[clean.length - 1] - 1]} ${year}`;
  return `${clean.length} bulan ${year}`;
}

/**
 * Rincian produktivitas per PPK (tujuan klik section Produktivitas).
 * Pola detail users/[id]: tombol Kembali + tabel scope periode.
 */
export default function ProduktivitasPage({
  searchParams,
}: {
  searchParams?: Promise<PageQuery>;
}) {
  const router = useRouter();
  const query = searchParams ? React.use(searchParams) : {};
  const year = Number(query.year) || new Date().getFullYear();
  const months = String(query.months ?? '')
    .split(',')
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const branchId = typeof query.branch_id === 'string' ? query.branch_id : '';

  const [data, setData] = React.useState<ProductivityOfficerRow[]>([]);
  const [scopeName, setScopeName] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ year: String(year) });
        if (months.length > 0) params.set('months', months.join(','));
        if (branchId) params.set('branch_id', branchId);
        const res = (await api.get(`/admin/productivity/officers?${params.toString()}`)) as unknown as ApiResponse<ProductivityOfficersView>;
        if (!cancelled && res.success && res.data) {
          setData(res.data.officers);
          setScopeName(res.data.scope.branchName ?? 'Seluruh ranting kecamatan');
        }
      } catch {
        // error ditampilkan sebagai tabel kosong
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnDef<ProductivityOfficerRow>[] = [
    {
      accessorKey: 'fullName',
      header: () => (
        <div className="flex items-center gap-1.5">
          <UserCheck size={12} className="text-[#EAD19B]" />
          <span>Petugas</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA]">{row.original.fullName}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest mt-0.5">
            {row.original.employeeCode} • {row.original.branchName}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'assigned',
      header: 'Ditugaskan',
      cell: ({ row }) => <span className="text-xs font-black text-[#F4F1EA]">{row.original.assigned}</span>,
    },
    {
      accessorKey: 'collected',
      header: 'Dijemput',
      cell: ({ row }) => <span className="text-xs font-black text-[#F4F1EA]">{row.original.collected}</span>,
    },
    {
      accessorKey: 'filled',
      header: 'Terisi',
      cell: ({ row }) => <span className="text-xs font-black text-[#1F8243]">{row.original.filled}</span>,
    },
    {
      accessorKey: 'uncollected',
      header: 'Tak dijemput',
      cell: ({ row }) => <span className="text-xs font-black text-[#DE6F4A]">{row.original.uncollected}</span>,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const page = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/overview')}
            aria-label="Kembali ke overview"
            className="h-9 w-9 shrink-0 p-0 rounded-xl border border-white/10 bg-white/5 text-[#F4F1EA]/70 hover:text-[#F4F1EA] hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
          >
            <ArrowLeft size={16} />
          </button>
          <Users className="text-[#EAD19B]" size={28} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Produktivitas PPK</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium truncate">
              {periodLabel(year, months)} • {scopeName || 'Memuat…'}
            </p>
          </div>
        </div>
      </div>

      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={page} loading={loading} variant="glass" />
          </div>
        </div>

        {!loading && data.length > 0 && (
          <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm px-4 h-10">
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Menampilkan</span>
              <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                <span className="text-xs font-black text-[#EAD19B]">{page.length}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
              <div className="min-w-[32px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                <span className="text-xs font-black text-[#F4F1EA]">{data.length}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Petugas</span>
            </div>

            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm">
              <div className="px-4 flex items-center gap-1.5 min-w-[140px] justify-center">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Halaman</span>
                <div className="w-6 h-6 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                  <span className="text-xs font-black text-[#EAD19B]">{currentPage}</span>
                </div>
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
                <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                  <span className="text-xs font-black text-[#F4F1EA]">{totalPages}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="w-10 h-10 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="w-10 h-10 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
