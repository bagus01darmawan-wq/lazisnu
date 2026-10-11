'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PieChart, RefreshCcw, Download } from 'lucide-react';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { c1Api, type MwcRecap, type MwcRecapRow } from '@/lib/c1';

/**
 * C1-T10 — Rekap MWC (tarik FINAL + unduh BA).
 * Dua kartu (§8b): Perolehan Ranting (dengan share) + Program MWC (bruto).
 * DRAFT tak berangka; flag merah otomatis dari server.
 */
export default function RekapMwcPage() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [recap, setRecap] = useState<MwcRecap | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await c1Api.getLaporanMwc(Number(year), Number(month));
      if (res.success && res.data) setRecap(res.data);
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal memuat rekap';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const columns: ColumnDef<MwcRecapRow, unknown>[] = [
    {
      id: 'branch',
      header: 'Ranting / Program',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold text-[#F4F1EA]">{row.original.branchName}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 uppercase tracking-wider">
            {row.original.kind === 'PROGRAM_MWC' ? 'Program MWC' : 'Ranting'}
          </span>
        </div>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => <span className="text-[#F4F1EA]">Rp {Number(row.original.total).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'share',
      header: 'Share',
      cell: ({ row }) => <span className="text-[#F4F1EA]">Rp {Number(row.original.shareMwc).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'FINAL' ? 'success' : row.original.status === 'FINAL_NOL' ? 'pending' : 'failed'} className="text-[#F4F1EA]">
          {row.original.status === 'BELUM_LAPOR' ? 'BELUM LAPOR' : row.original.status}
        </Badge>
      ),
    },
    {
      id: 'flags',
      header: 'Flag',
      cell: ({ row }) => (
        <span className="text-xs text-[#F4F1EA]/70">{row.original.flags.join(', ') || '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PieChart className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Rekap MWC</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Tarik data FINAL + unduh berita acara</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-transparent p-4 md:p-5 border-none shadow-none">
        <div className="hidden lg:block lg:flex-1" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-end gap-3 w-full lg:w-auto">
          <PeriodPicker months={[Number(month)]} year={Number(year)} onChange={(m, y) => { setMonth(String(m[0] ?? month)); setYear(String(y)); }} />
          <button
            className="px-4 py-2 h-[36px] rounded-xl text-[11px] font-bold text-[#EAD19B] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 hover:bg-[#EAD19B]/10 transition-all active:scale-95 flex items-center gap-2"
            onClick={fetchData}>
            <RefreshCcw size={14} strokeWidth={2.5} />
            Muat Ulang
          </button>
        </div>
      </div>

      {recap ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card variant="glass" title={`Perolehan Ranting • ${recap.period}`}>
            <p className="text-2xl font-bold text-[#F4F1EA]">Rp {Number(recap.kartuRanting.total).toLocaleString('id-ID')}</p>
            <p className="text-xs text-[#F4F1EA]/50">
              Share Rp {Number(recap.kartuRanting.shareMwc).toLocaleString('id-ID')} • Lapor {recap.kartuRanting.reportedCount} •
              NOL {recap.kartuRanting.finalNolCount} • Belum {recap.kartuRanting.belumLaporCount}
            </p>
          </Card>
          <Card variant="glass" title="Perolehan Program MWC">
            <p className="text-2xl font-bold text-[#F4F1EA]">Rp {Number(recap.kartuProgram.total).toLocaleString('id-ID')}</p>
            <p className="text-xs text-[#F4F1EA]/50">Bruto penuh (tanpa share 30%) • Lapor {recap.kartuProgram.reportedCount}</p>
          </Card>
        </div>
      ) : null}

      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full transition-all duration-700">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={recap?.rows ?? []} loading={loading} variant="glass" />
          </div>
        </div>
      </Card>
      <p className="text-xs text-[#F4F1EA]/50 flex items-center gap-1">
        <Download size={12} /> Berkas BA per ranting dapat diambil di halaman Berita Acara.
      </p>
    </div>
  );
}
