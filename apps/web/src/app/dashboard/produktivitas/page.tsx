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

/** Data produktivitas per PPK (camelCase — hasil normalisasi caseConverter). */
interface ProductivityOfficerRow {
  officerId: string;
  fullName: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  pickup: {
    assigned: number;
    collected: number;
    filled: number;
    empty: number;
    failed: number;
  };
  visit: {
    assigned: number;
    visited: number;
    isi: number;
    empty: number;
    returned: number;
    failed: number;
  };
}

interface ProductivityTaskRow {
  officerId: string;
  fullName: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  kind: 'PICKUP' | 'VISIT';
  assigned: number;
  completed: number;
  filled: number;
  empty: number;
  returned: number | null;
  failed: number;
}

function hasNumericFields(value: unknown, fields: string[]): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return fields.every((field) => typeof record[field] === 'number');
}

function hasSplitProductivityMetrics(value: unknown): value is ProductivityOfficerRow[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const officer = item as Record<string, unknown>;
    return hasNumericFields(officer.pickup, ['assigned', 'collected', 'filled', 'empty', 'failed'])
      && hasNumericFields(officer.visit, ['assigned', 'visited', 'isi', 'empty', 'returned', 'failed']);
  });
}

function toTaskRows(officers: ProductivityOfficerRow[]): ProductivityTaskRow[] {
  return officers.flatMap((officer) => {
    const identity = {
      officerId: officer.officerId,
      fullName: officer.fullName,
      employeeCode: officer.employeeCode,
      branchId: officer.branchId,
      branchName: officer.branchName,
    };

    return [
      {
        ...identity,
        kind: 'PICKUP' as const,
        assigned: officer.pickup.assigned,
        completed: officer.pickup.collected,
        filled: officer.pickup.filled,
        empty: officer.pickup.empty,
        returned: null,
        failed: officer.pickup.failed,
      },
      {
        ...identity,
        kind: 'VISIT' as const,
        assigned: officer.visit.assigned,
        completed: officer.visit.visited,
        filled: officer.visit.isi,
        empty: officer.visit.empty,
        returned: officer.visit.returned,
        failed: officer.visit.failed,
      },
    ];
  });
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
  const [dataError, setDataError] = React.useState('');
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
          setScopeName(res.data.scope.branchName ?? 'Seluruh ranting kecamatan');
          if (!hasSplitProductivityMetrics(res.data.officers)) {
            setData([]);
            setDataError('Rincian Penjemputan dan Kunjungan belum tersedia dari backend. Backend perlu diperbarui untuk menampilkan tabel ini.');
            return;
          }
          setData(res.data.officers);
          setDataError('');
        }
      } catch {
        if (!cancelled) setDataError('Data produktivitas tidak dapat dimuat. Coba lagi nanti.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnDef<ProductivityTaskRow, unknown>[] = [
    {
      accessorKey: 'fullName',
      header: () => (
        <div className="flex items-center gap-1.5">
          <UserCheck size={12} className="text-[#EAD19B]" />
          <span>PPK</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col min-w-[150px]">
          <span className="font-bold text-[#F4F1EA]">{row.original.fullName}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest mt-0.5">
            {row.original.employeeCode} • {row.original.branchName}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'kind',
      header: 'Jenis tugas',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs font-bold text-[#EAD19B]">
          {row.original.kind === 'PICKUP' ? 'Penjemputan' : 'Kunjungan'}
        </span>
      ),
    },
    {
      accessorKey: 'assigned',
      header: 'Ditugaskan',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-black text-[#F4F1EA]">{row.original.assigned}</span>,
    },
    {
      accessorKey: 'completed',
      header: 'Selesai',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-xs font-black text-[#F4F1EA]">{row.original.completed}</span>
          <span className="text-[10px] text-[#F4F1EA]/50">
            {row.original.kind === 'PICKUP' ? 'dijemput' : 'dikunjungi'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'filled',
      header: 'Isi',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-black text-[#1F8243]">{row.original.filled}</span>,
    },
    {
      accessorKey: 'empty',
      header: 'Kosong',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-black text-[#F4F1EA]">{row.original.empty}</span>,
    },
    {
      accessorKey: 'returned',
      header: 'Dikembalikan',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-black text-[#F4F1EA]">{row.original.returned ?? '—'}</span>,
    },
    {
      accessorKey: 'failed',
      header: 'Gagal',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-black text-[#DE6F4A]">{row.original.failed}</span>,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const page = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const taskRows = toTaskRows(page);

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
        {dataError ? (
          <div role="alert" className="px-6 py-10 text-center text-sm font-medium text-[#F4F1EA]/70">
            {dataError}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto w-full custom-scrollbar">
              <div className="min-w-[980px] w-full">
                <Table
                  columns={columns}
                  data={taskRows}
                  loading={loading}
                  variant="glass"
                  getCellRowSpan={(row, columnId) => {
                    if (columnId !== 'fullName') return undefined;
                    return row.kind === 'PICKUP' ? 2 : 0;
                  }}
                />
              </div>
            </div>
            <p className="px-4 md:px-6 py-3 text-[11px] text-[#F4F1EA]/50 border-t border-white/5">
              Ditugaskan mengikuti PPK penerima tugas; hasil mengikuti PPK pelaksana.
            </p>

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
          </>
        )}
      </Card>
    </div>
  );
}
