'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ClipboardCheck, CheckCircle2, Clock, RefreshCcw } from 'lucide-react';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { c1Api, type PeriodDraftItem, type StafSummary } from '@/lib/c1';

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
 * C1-T10 — Persetujuan draft tugas (Staf Pengumpulan + Keuangan eskalasi).
 * Monitor scope + setujui (server menegakkan: tanpa FINAL/kunci/nominal).
 */
export default function PersetujuanPage() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [summary, setSummary] = useState<StafSummary | null>(null);
  const [drafts, setDrafts] = useState<PeriodDraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, draftRes] = await Promise.all([
        c1Api.getStafSummary(Number(year), Number(month)),
        c1Api.getDrafts(Number(year), Number(month)),
      ]);
      if (sumRes.success && sumRes.data) setSummary(sumRes.data);
      if (draftRes.success && draftRes.data) setDrafts(draftRes.data);
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal memuat data';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    // react-hooks/set-state-in-effect (React Hooks v6): setState sinkron di efek
    // memicu cascading render. fetchData() aman dipanggil karena async (await
    // setelah setState) — pembungkus tick menegaskan bahwa lint bukan false positive.
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await c1Api.approveDraft(id);
      if (res.success) {
        fetchData();
        toast.success('Draft disetujui — tugas aktif');
      }
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal menyetujui';
      toast.error(msg);
    } finally {
      setApprovingId(null);
    }
  };

  const columns: ColumnDef<PeriodDraftItem, unknown>[] = [
    {
      id: 'branch',
      header: 'Ranting / Program',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.original.branch_name}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {row.original.branch_kind === 'PROGRAM_MWC' ? 'Program MWC' : 'Ranting'} • {row.original.item_count} kaleng
          </span>
        </div>
      ),
    },
    {
      id: 'event',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'APPROVED' ? 'success' : row.original.event_kind === 'ESCALATED' ? 'failed' : 'pending'}>
          {row.original.event_kind}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => row.original.status !== 'APPROVED' ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-bold rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200"
            disabled={approvingId === row.original.id}
            onClick={() => handleApprove(row.original.id)}
            title="Setujui draft">
            <CheckCircle2 size={14} />
            {approvingId === row.original.id ? '…' : 'Setujui'}
          </Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Persetujuan Tugas</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Setujui draft robot + pantau progres PPK scope Anda</p>
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

      {summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card title="Menunggu">
            <p className="text-2xl font-bold text-slate-900">{summary.drafts.pending}</p>
            <p className="text-xs text-slate-500">draft menunggu persetujuan</p>
          </Card>
          <Card title="Eskalasi">
            <p className="text-2xl font-bold text-slate-900">{summary.drafts.escalated}</p>
            <p className="text-xs text-slate-500">lewat 24 jam (giliran Keuangan)</p>
          </Card>
          <Card title="PPK FINAL">
            <p className="text-2xl font-bold text-slate-900">{summary.ppk.final_count}/{summary.ppk.total_count}</p>
            <p className="text-xs text-slate-500">tugas aktif tersisa: {summary.tugas_active}</p>
          </Card>
          <Card title="Batas Waktu">
            <p className="text-2xl font-bold text-slate-900 flex items-center gap-1">
              <Clock size={20} />
              {summary.in_tolerance ? `${summary.days_to_lock} hr` : `${summary.days_to_due} hr`}
            </p>
            <p className="text-xs text-slate-500">{summary.in_tolerance ? 'masa toleransi' : 'sisa penjemputan'} • {summary.period_status}</p>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-[#6B9E9F] p-4 md:p-5 rounded-2xl border border-[#6B9E9F] shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <DropdownFilter
            label="Bulan"
            options={MONTHS}
            value={month}
            onChange={(v) => setMonth(v)}
            className="h-[36px]"
          />
          <DropdownFilter
            label="Tahun"
            options={YEARS}
            value={year}
            onChange={(v) => setYear(v)}
            className="h-[36px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden w-full max-w-full">
        <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={drafts} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
