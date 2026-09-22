'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PieChart, RefreshCcw, Download } from 'lucide-react';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { c1Api, type MwcRecap, type MwcRecapRow } from '@/lib/c1';

const MONTHS = [
  { label: 'Januari', value: '1' }, { label: 'Februari', value: '2' },
  { label: 'Maret', value: '3' }, { label: 'April', value: '4' },
  { label: 'Mei', value: '5' }, { label: 'Juni', value: '6' },
  { label: 'Juli', value: '7' }, { label: 'Agustus', value: '8' },
  { label: 'September', value: '9' }, { label: 'Oktober', value: '10' },
  { label: 'November', value: '11' }, { label: 'Desember', value: '12' },
];
const YEARS = ['2024', '2025', '2026', '2027'].map((y) => ({ label: y, value: y }));

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
    fetchData();
  }, [fetchData]);

  const columns: ColumnDef<MwcRecapRow, unknown>[] = [
    {
      id: 'branch',
      header: 'Ranting / Program',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.original.branch_name}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {row.original.kind === 'PROGRAM_MWC' ? 'Program MWC' : 'Ranting'}
          </span>
        </div>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => <span className="text-slate-900">Rp {Number(row.original.total).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'share',
      header: 'Share',
      cell: ({ row }) => <span className="text-slate-900">Rp {Number(row.original.share_mwc).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'FINAL' ? 'success' : row.original.status === 'FINAL_NOL' ? 'pending' : 'failed'}>
          {row.original.status === 'BELUM_LAPOR' ? 'BELUM LAPOR' : row.original.status}
        </Badge>
      ),
    },
    {
      id: 'flags',
      header: 'Flag',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">{row.original.flags.join(', ') || '—'}</span>
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
        <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
          <button
            className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#EAD19B] hover:bg-[#EAD19B]/10 transition-all active:scale-95 flex items-center gap-2"
            onClick={fetchData}>
            <RefreshCcw size={14} strokeWidth={2.5} />
            Muat Ulang
          </button>
        </div>
      </div>

      {recap ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title={`Perolehan Ranting • ${recap.period}`}>
            <p className="text-2xl font-bold text-slate-900">Rp {Number(recap.kartu_ranting.total).toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500">
              Share Rp {Number(recap.kartu_ranting.share_mwc).toLocaleString('id-ID')} • Lapor {recap.kartu_ranting.reported_count} •
              NOL {recap.kartu_ranting.final_nol_count} • Belum {recap.kartu_ranting.belum_lapor_count}
            </p>
          </Card>
          <Card title="Perolehan Program MWC">
            <p className="text-2xl font-bold text-slate-900">Rp {Number(recap.kartu_program.total).toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500">Bruto penuh (tanpa share 30%) • Lapor {recap.kartu_program.reported_count}</p>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-[#6B9E9F] p-4 md:p-5 rounded-2xl border border-[#6B9E9F] shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <DropdownFilter label="Bulan" options={MONTHS} value={month} onChange={(v) => setMonth(v)} className="h-[36px]" />
          <DropdownFilter label="Tahun" options={YEARS} value={year} onChange={(v) => setYear(v)} className="h-[36px]" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden w-full max-w-full">
        <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={recap?.rows ?? []} loading={loading} />
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1">
        <Download size={12} /> Unduh BA per ranting tersedia di halaman Setoran / aplikasi mobile.
      </p>
    </div>
  );
}
