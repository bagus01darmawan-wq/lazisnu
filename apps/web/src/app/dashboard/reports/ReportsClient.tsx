'use client';

import React from 'react';
import { Table } from '@/components/ui/Table';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function ReportsClient({ data, pagination }: { data: any[], pagination?: { page: number, limit: number, total: number, total_pages: number } }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`?${params.toString()}`);
  };
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'collected_at',
      header: 'Tanggal',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-slate-500">
          {format(new Date(row.original.collected_at), 'PPP', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'qr_code',
      header: 'Kode Kaleng',
      cell: ({ row }) => <span className="font-bold text-slate-900">{row.original.qr_code}</span>,
    },
    {
      accessorKey: 'owner_name',
      header: 'Penyumbang',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.owner_name}</span>,
    },
    {
      accessorKey: 'officer_name',
      header: 'Petugas',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
             {row.original.officer_name.charAt(0)}
           </div>
           <span className="text-sm">{row.original.officer_name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal',
      cell: ({ row }) => (
        <span className="font-bold text-green-600">
          Rp {Number(row.original.nominal).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <Table columns={columns} data={data} loading={false} />
      
      {pagination && pagination.total > 0 && (
        <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
          <p className="text-xs font-medium text-slate-500">
            Menampilkan <span className="font-bold text-slate-900">{data.length}</span> dari <span className="font-bold text-slate-900">{pagination.total}</span> laporan
          </p>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
              <select
                value={pagination.limit}
                onChange={(e) => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('limit', e.target.value);
                  params.set('page', '1');
                  router.push(`?${params.toString()}`);
                }}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                Halaman <span className="text-green-600">{pagination.page}</span> dari {pagination.total_pages}
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
