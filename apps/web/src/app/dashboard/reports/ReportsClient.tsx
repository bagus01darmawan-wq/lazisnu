'use client';

import React from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { Calendar } from 'lucide-react';

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
        <span className="text-xs font-medium text-[#F4F1EA]/60">
          {format(new Date(row.original.collected_at), 'PPP', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'qr_code',
      header: 'Kode Kaleng',
      cell: ({ row }) => <span className="font-bold text-[#F4F1EA]">{row.original.qr_code}</span>,
    },
    {
      accessorKey: 'owner_name',
      header: 'Penyumbang',
      cell: ({ row }) => <span className="text-sm font-bold text-[#F4F1EA]">{row.original.owner_name}</span>,
    },
    {
      accessorKey: 'officer_name',
      header: 'Petugas',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-[#EAD19B]">
            {row.original.officer_name.charAt(0)}
          </div>
          <span className="text-sm font-medium text-[#F4F1EA]/80">{row.original.officer_name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal',
      cell: ({ row }) => (
        <span className="font-bold text-[#1F8243]">
          Rp {Number(row.original.nominal).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  const totalPages = pagination?.total_pages || 0;
  const currentPage = pagination?.page || 1;
  const limit = pagination?.limit || 10;
  const total = pagination?.total || 0;

  return (
    <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full transition-all duration-700">
      <div className="px-6 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
        <h3 className="font-bold text-[#F4F1EA] flex items-center gap-2 tracking-tight">
          <Calendar size={18} className="text-[#EAD19B]" />
          Transaksi Terakhir
        </h3>
      </div>

      <div className="overflow-x-auto w-full custom-scrollbar">
        <Table columns={columns} data={data} loading={false} variant="glass" />
      </div>

      {pagination && pagination.total > 0 && (
        <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left: Summary Info Badge */}
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm px-4 h-10">
            <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Menampilkan</span>
            <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
              <span className="text-xs font-black text-[#EAD19B]">{data.length}</span>
            </div>
            <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
            <div className="min-w-[32px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
              <span className="text-xs font-black text-[#F4F1EA]">{total}</span>
            </div>
            <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Laporan</span>
          </div>

          {/* Right: Smart Control Pill */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
            {/* Page Info Badge */}
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

            {/* Navigation Arrows */}
            <div className="flex items-center gap-1 pl-2 border-l border-white/5">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
              >
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </div>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
              >
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
