'use client';

import React, { useEffect, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CalendarDays, History, QrCode, RotateCcw, Search, User as UserIcon } from 'lucide-react';
import { ApiResponse, ResubmitTrackerItem } from '@lazisnu/shared-types';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';

const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return format(new Date(value), 'dd MMM yyyy, HH:mm', { locale: id });
};

export default function ResubmitPage() {
  const [data, setData] = useState<ResubmitTrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const PAGE_SIZE = 20;

  const fetchResubmits = async (searchQuery = search, currentPage = page, limit = PAGE_SIZE) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/bendahara/resubmits', {
        params: { page: currentPage, limit, search: searchQuery || undefined },
      }) as unknown as ApiResponse<{ items: ResubmitTrackerItem[]; pagination: { total: number; total_pages: number } }>;
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Riwayat koreksi tidak dapat dimuat.');
      }
      setData(response.data.items);
      setTotalItems(response.data.pagination.total);
      setTotalPages(Math.max(1, response.data.pagination.total_pages));
    } catch (requestError) {
      setData([]);
      setTotalItems(0);
      setTotalPages(1);
      setError(requestError instanceof Error ? requestError.message : 'Riwayat koreksi tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      void fetchResubmits(search, 1, PAGE_SIZE);
    }, 350);
    return () => window.clearTimeout(timer);
    // fetchResubmits intentionally receives explicit values to avoid a stale request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleReset = () => {
    setSearch('');
    setPage(1);
    void fetchResubmits('', 1, PAGE_SIZE);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
    void fetchResubmits(search, nextPage, PAGE_SIZE);
  };

  const columns: ColumnDef<ResubmitTrackerItem>[] = [
    {
      accessorKey: 'corrected_at',
      header: () => <span className="flex items-center gap-1.5"><CalendarDays size={12} className="text-[#EAD19B]" />Tanggal Koreksi</span>,
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.corrected_at)}</span>,
      size: 160,
    },
    {
      id: 'officer',
      header: () => <span className="flex items-center gap-1.5"><UserIcon size={12} className="text-[#EAD19B]" />Petugas</span>,
      cell: ({ row }) => <div className="flex flex-col"><span className="font-bold text-[#F4F1EA]">{row.original.officer_name}</span><span className="text-[10px] font-bold tracking-widest text-[#F4F1EA]/40">{row.original.officer_code}</span></div>,
      size: 200,
    },
    {
      id: 'can',
      header: () => <span className="flex items-center gap-1.5"><QrCode size={12} className="text-[#EAD19B]" />Kaleng / Pemilik</span>,
      cell: ({ row }) => <div className="flex flex-col"><span className="font-bold text-[#F4F1EA]">{row.original.owner_name}</span><span className="text-[10px] font-bold tracking-widest text-[#F4F1EA]/40">{row.original.qr_code}</span></div>,
      size: 220,
    },
    {
      accessorKey: 'original_nominal',
      header: 'Nominal Awal',
      cell: ({ row }) => <span className="whitespace-nowrap text-sm font-bold text-[#D97A76] line-through">{formatCurrency(row.original.original_nominal)}</span>,
      size: 140,
    },
    {
      accessorKey: 'corrected_nominal',
      header: 'Nominal Revisi',
      cell: ({ row }) => <span className="whitespace-nowrap text-sm font-bold text-[#1F8243]">{formatCurrency(row.original.corrected_nominal)}</span>,
      size: 140,
    },
    {
      accessorKey: 'alasan_resubmit',
      header: 'Alasan Koreksi',
      cell: ({ row }) => <span className="block min-w-48 max-w-72 text-xs leading-relaxed text-[#F4F1EA]/70">{row.original.alasan_resubmit || '-'}</span>,
      size: 280,
    },
    {
      accessorKey: 'submit_sequence',
      header: 'Versi',
      cell: ({ row }) => <span className="rounded-lg border border-[#EAD19B]/30 bg-[#EAD19B]/10 px-2 py-1 text-xs font-bold text-[#EAD19B]">v{row.original.submit_sequence}</span>,
      size: 90,
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <History size={28} className="mt-1 text-[#EAD19B]" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#F4F1EA]">Riwayat Koreksi</h1>
            <p className="text-sm font-medium text-[#F4F1EA]/60">Jejak audit koreksi nominal yang dibuat langsung oleh petugas lapangan.</p>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-[#EAD19B]/20 bg-[#EAD19B]/10 p-4 text-sm text-[#F4F1EA]/80">
        Nominal transaksi tidak dapat diubah dari dashboard. Setiap koreksi dibuat oleh petugas di aplikasi Android dan tersimpan sebagai versi transaksi baru.
      </div>

      {/* Transparent Toolbar Section - Standard */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-transparent p-5 border-none shadow-none">
        <div className="relative w-[160px] group">
          {/* Refined Search Pill Design - Standardized Height */}
          <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
            <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
              <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari..."
              className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            type="button"
            onClick={handleReset}
            className="h-[36px] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white/90 hover:bg-[#F4F1EA]/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
          >
            <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
            Reset
          </button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-[#D97A76]/40 bg-[#D97A76]/10 p-4 text-sm text-[#F4F1EA]">{error}</div> : null}

      <Card variant="glass" className="min-w-0 w-full max-w-full overflow-hidden p-0">
        <div className="w-full overflow-x-auto custom-scrollbar">
          <div className="min-w-[1230px] w-full">
            <Table columns={columns} data={data} loading={loading} variant="glass" />
          </div>
        </div>
        {!loading && totalItems > 0 ? (
          <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Summary Info Badge */}
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm px-4 h-10">
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Menampilkan</span>
              <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                <span className="text-xs font-black text-[#EAD19B]">{data.length}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
              <div className="min-w-[32px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                <span className="text-xs font-black text-[#F4F1EA]">{totalItems}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Koreksi</span>
            </div>

            {/* Right: Smart Control Pill */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
              {/* Page Info Badge */}
              <div className="px-4 flex items-center gap-1.5 min-w-[140px] justify-center">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Halaman</span>
                <div className="w-6 h-6 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                  <span className="text-xs font-black text-[#EAD19B]">{page}</span>
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
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}