'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { FileSignature, Download, RefreshCcw, PenLine } from 'lucide-react';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { SignaturePad } from '@/components/SignaturePad';
import { c1Api, type BranchSubmissionDetail, type BaVersion } from '@/lib/c1';

const MONTHS = [
  { label: 'Januari', value: '1' }, { label: 'Februari', value: '2' },
  { label: 'Maret', value: '3' }, { label: 'April', value: '4' },
  { label: 'Mei', value: '5' }, { label: 'Juni', value: '6' },
  { label: 'Juli', value: '7' }, { label: 'Agustus', value: '8' },
  { label: 'September', value: '9' }, { label: 'Oktober', value: '10' },
  { label: 'November', value: '11' }, { label: 'Desember', value: '12' },
];
const YEARS = ['2024', '2025', '2026', '2027'].map((y) => ({ label: y, value: y }));
const REASONS = ['KURANG_BAYAR', 'LEBIH_BAYAR', 'GABUNG_PERIODE', 'KOREKSI_ADMIN', 'HP_HILANG'].map((r) => ({ label: r, value: r }));

/**
 * C1-T10 — Setoran Ranting (Admin Ranting: kunci + TTD + BA + unduh).
 * Sign di sesi sendiri (kanvas web); countersign oleh Bendahara MWC.
 * Penjaga scope + angka di server; web hanya form + unduh.
 */
export default function SetoranPage() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [rows, setRows] = useState<BranchSubmissionDetail[]>([]);
  const [selected, setSelected] = useState<BranchSubmissionDetail | null>(null);
  const [versions, setVersions] = useState<BaVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [signOpen, setSignOpen] = useState(false);
  const [share, setShare] = useState('');
  const [reason, setReason] = useState('');
  const [asNol, setAsNol] = useState(false);
  const [consent, setConsent] = useState(false);
  const [strokes, setStrokes] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await c1Api.getBranchSubmissions(Number(year), Number(month));
      if (res.success && res.data) {
        setRows(res.data);
        if (res.data.length === 1) {
          const detail = await c1Api.getBranchSubmission(res.data[0].id);
          if (detail.success && detail.data) {
            setSelected(detail.data);
            const vers = await c1Api.getBranchPdfVersions(detail.data.id);
            if (vers.success && vers.data) setVersions(vers.data);
          }
        } else {
          setSelected(null);
          setVersions([]);
        }
      }
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal memuat setoran';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const openDetail = async (id: string) => {
    try {
      const [detail, vers] = await Promise.all([
        c1Api.getBranchSubmission(id),
        c1Api.getBranchPdfVersions(id),
      ]);
      if (detail.success && detail.data) setSelected(detail.data);
      if (vers.success && vers.data) setVersions(vers.data);
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal memuat rincian';
      toast.error(msg);
    }
  };

  const handleSign = async () => {
    if (!selected) return;
    if (!strokes) {
      toast.error('Coret tanda tangan dulu');
      return;
    }
    if (!consent) {
      toast.error('Centang persetujuan eksplisit dulu');
      return;
    }
    try {
      const res = await c1Api.signBranch(selected.id, {
        signature_png: strokes,
        consent: true,
        expected_version: selected.version,
        share_mwc: Number(share || 0),
        variance_reason: reason || undefined,
        as_nol: asNol || undefined,
      });
      if (res.success) {
        setSignOpen(false);
        setStrokes(null);
        setConsent(false);
        fetchData();
        if (selected.id && res.data) openDetail(selected.id);
        toast.success('Setoran ditandatangani — menunggu Bendahara MWC');
      }
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal menandatangani';
      toast.error(msg);
    }
  };

  const handleDownload = async () => {
    if (!selected) return;
    try {
      await c1Api.downloadBranchPdf(selected.id, `BA-${selected.period}-v${selected.version}.pdf`);
      toast.success('Berita acara diunduh');
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Berkas belum siap';
      toast.error(msg);
    }
  };

  const columns: ColumnDef<BranchSubmissionDetail, unknown>[] = [
    {
      id: 'period',
      header: 'Periode',
      cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.period}</span>,
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => <span className="text-slate-900">Rp {Number(row.original.total_amount).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'share',
      header: 'Share MWC',
      cell: ({ row }) => <span className="text-slate-900">Rp {Number(row.original.share_mwc).toLocaleString('id-ID')}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'FINAL' ? 'success' : row.original.status === 'FINAL_NOL' ? 'pending' : 'failed'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-bold rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200"
            onClick={() => openDetail(row.original.id)}>
            Rincian
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileSignature className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Setoran Ranting</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Kunci + tanda tangan + berita acara ranting Anda</p>
          </div>
        </div>
        <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
          <button
            className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#EAD19B] hover:bg-[#EAD19B]/10 transition-all active:scale-95 flex items-center gap-2"
            onClick={fetchData}>
            <RefreshCcw size={14} strokeWidth={2.5} />
            Muat Ulang
          </button>
          {selected && (selected.status === 'FINAL' || selected.status === 'FINAL_NOL') ? (
            <button
              className="px-4 py-2 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2 ml-1"
              onClick={handleDownload}>
              <Download size={14} strokeWidth={2.5} />
              Unduh BA
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-[#6B9E9F] p-4 md:p-5 rounded-2xl border border-[#6B9E9F] shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <DropdownFilter label="Bulan" options={MONTHS} value={month} onChange={(v) => setMonth(v)} className="h-[36px]" />
          <DropdownFilter label="Tahun" options={YEARS} value={year} onChange={(v) => setYear(v)} className="h-[36px]" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden w-full max-w-full">
        <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={rows} loading={loading} />
          </div>
        </div>
      </div>

      {selected ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Rincian Setoran">
            <p className="text-sm text-slate-600">Total Rp {Number(selected.total_amount).toLocaleString('id-ID')} • Bisyaroh Rp {Number(selected.bisyaroh_total).toLocaleString('id-ID')} • Bersih Rp {Number(selected.net_amount).toLocaleString('id-ID')}</p>
            <p className="text-sm text-slate-600 mt-1">Ekspektasi share Rp {Number(selected.expected_share).toLocaleString('id-ID')} • Selisih Rp {Number(selected.share_variance).toLocaleString('id-ID')}
              {selected.variance_reason ? ` • Alasan: ${selected.variance_reason}` : ''}</p>
            <div className="mt-3 space-y-1">
              {(selected.ppk_penyusun || []).map((p) => (
                <p key={p.officer_name} className="text-sm text-slate-700">{p.officer_name} — Rp {Number(p.total).toLocaleString('id-ID')} ({p.status})</p>
              ))}
            </div>
            {selected.status === 'DRAFT' ? (
              <Button
                className="mt-4 flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-600/20"
                onClick={() => setSignOpen(true)}>
                <PenLine size={16} /> Tanda Tangani
              </Button>
            ) : null}
          </Card>
          <Card title={`Riwayat BA (${versions.length})`}>
            {versions.map((v) => (
              <p key={v.version} className="text-sm text-slate-700">
                v{v.version} • {v.status}{v.is_current ? ' • berlaku' : ''} • {v.pdf_hash ? 'PDF siap' : 'belum diunduh'}
              </p>
            ))}
            {versions.length === 0 ? <p className="text-sm text-slate-400">Belum ada riwayat.</p> : null}
          </Card>
        </div>
      ) : null}

      <Modal isOpen={signOpen} onClose={() => setSignOpen(false)} title="Tanda Tangan Ranting">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Share MWC (Rp)</label>
            <input
              value={share}
              onChange={(e) => setShare(e.target.value)}
              inputMode="numeric"
              placeholder="cth. 1675000"
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Alasan selisih (bila &gt; Rp 10.000)</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer">
              <option value="">-- Tanpa alasan (selisih kecil) --</option>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={asNol} onChange={(e) => setAsNol(e.target.checked)} />
            Kunci 0 pemasukan (FINAL_NOL)
          </label>
          <SignaturePad onChange={setStrokes} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Saya menyetujui berita acara ini (persetujuan eksplisit)
          </label>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1 rounded-xl h-12 font-bold" onClick={() => setSignOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-600/20"
              onClick={handleSign}>
              Tanda Tangani
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
