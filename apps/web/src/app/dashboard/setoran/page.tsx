'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { FileSignature, Download, RefreshCcw, FileCog, Eye, TriangleAlert } from 'lucide-react';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { c1Api, type BranchSubmissionDetail, type BaVersion, type BranchBaText } from '@/lib/c1';

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
 * Label Indonesia untuk `ppk_submission_status` (schema.ts:17 —
 * DRAFT / PPK_SIGNED / FINAL). Sebelumnya enum mentah ini tampil apa adanya
 * di daftar penyusun PPK.
 */
const PPK_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Belum ditandatangani PPK',
  PPK_SIGNED: 'Ditandatangani PPK',
  FINAL: 'Sah',
};

/**
 * C1-T10 — Berita Acara Ranting: **halaman laporan, baca saja**.
 *
 * Koreksi Pion 23 Sep 2026: Admin Ranting / MWC **tidak menandatangani apa pun**.
 * Serah terima dilakukan oleh **Bendahara Ranting** (STAF_KEUANGAN bercakupan
 * ranting) di aplikasi mobile. Halaman ini hanya melaporkan BA yang sudah terbit
 * (sudah ada serah terima PPK ↔ Bendahara) dan menyediakan berkasnya.
 *
 * Permintaan Pion: tombol **Unduh nonaktif** sampai tombol **Generate** ditekan,
 * dan berkas PDF **dihapus otomatis begitu jendela ditutup** (agar tidak menumpuk
 * di R2). Server tetap penjaga terakhir: gerbang scope, status, dan audit.
 */
export default function SetoranPage() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [rows, setRows] = useState<BranchSubmissionDetail[]>([]);
  const [selected, setSelected] = useState<BranchSubmissionDetail | null>(null);
  const [versions, setVersions] = useState<BaVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // Jendela BA
  const [baOpen, setBaOpen] = useState(false);
  const [baText, setBaText] = useState<BranchBaText | null>(null);
  const [baLoading, setBaLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /**
   * Penghapusan saat modal ditutup berjalan di latar. Kalau user langsung
   * membuka lagi lalu menekan Generate, hasil generate bisa terhapus oleh
   * penghapusan yang masih terbang — jadi ditunggu dulu sebelum generate.
   */
  const pendingDelete = React.useRef<Promise<unknown> | null>(null);

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
        || (error as { message?: string })?.message || 'Gagal memuat laporan BA';
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

  /** Buka jendela BA: muat teks BA (baca saja) + rincian + reset status Generate. */
  const openBa = async (row: BranchSubmissionDetail) => {
    setSelected(row);
    setBaOpen(true);
    setGenerated(false);
    setBaText(null);
    setBaLoading(true);
    try {
      const [detail, text, vers] = await Promise.all([
        c1Api.getBranchSubmission(row.id),
        c1Api.getBranchBeritaAcara(row.id),
        c1Api.getBranchPdfVersions(row.id),
      ]);
      // Baris tabel tidak memuat `ppk_penyusun` — ambil rinciannya.
      if (detail.success && detail.data) setSelected(detail.data);
      if (text.success && text.data) setBaText(text.data);
      if (vers.success && vers.data) setVersions(vers.data);
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal memuat berita acara';
      toast.error(msg);
    } finally {
      setBaLoading(false);
    }
  };

  /**
   * Tutup jendela + bersihkan berkas. Best-effort: kegagalan penghapusan tidak
   * boleh menahan user menutup jendela (server mencatatnya sebagai peringatan).
   */
  const closeBa = () => {
    const target = selected;
    const hadPdf = generated || versions.some((v) => v.is_current && v.pdf_hash);
    setBaOpen(false);
    setBaText(null);
    setGenerated(false);
    if (target && hadPdf) {
      pendingDelete.current = c1Api.deleteBranchPdf(target.id).catch(() => {
        /* dibersihkan best-effort; server mencatat kegagalan */
      });
    }
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      // Tunggu penghapusan sebelumnya selesai dulu (lihat pendingDelete).
      if (pendingDelete.current) {
        await pendingDelete.current;
        pendingDelete.current = null;
      }
      const res = await c1Api.generateBranchPdf(selected.id);
      if (res.success) {
        setGenerated(true);
        toast.success('PDF berita acara siap diunduh');
      } else {
        toast.error(res.error?.message || 'Gagal membuat PDF');
      }
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Gagal membuat PDF';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      await c1Api.downloadBranchPdf(selected.id, `BA-${selected.period}-v${selected.version}.pdf`);
      toast.success('Berita acara diunduh');
    } catch (error: unknown) {
      const msg = (error as { error?: { message?: string }; message?: string })?.error?.message
        || (error as { message?: string })?.message || 'Berkas belum siap';
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  const isIssued = (s: string) => s === 'FINAL' || s === 'FINAL_NOL';

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
      header: 'Status BA',
      cell: ({ row }) => (
        <Badge variant={isIssued(row.original.status) ? 'success' : 'pending'}>
          {isIssued(row.original.status) ? 'Sudah diterbitkan' : 'Belum diterbitkan'}
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
          {isIssued(row.original.status) ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs font-bold rounded-lg hover:bg-[#EAD19B]/20 hover:text-[#2C473E] transition-all border-slate-200"
              onClick={() => void openBa(row.original)}>
              <Eye size={13} className="mr-1" />
              Lihat BA
            </Button>
          ) : null}
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
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Berita Acara</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">
              Laporan BA yang sudah diterbitkan — baca saja
            </p>
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
                <p key={p.officer_name} className="text-sm text-slate-700">{p.officer_name} — Rp {Number(p.total).toLocaleString('id-ID')} ({PPK_STATUS_LABEL[p.status] ?? p.status})</p>
              ))}
            </div>
          </Card>
          <Card title={`Riwayat BA (${versions.length})`}>
            {versions.map((v) => (
              <p key={v.version} className="text-sm text-slate-700">
                v{v.version} • {v.status}{v.is_current ? ' • berlaku' : ''} • {v.pdf_hash ? 'berkas tersimpan' : 'belum dibuat'}
              </p>
            ))}
            {versions.length === 0 ? <p className="text-sm text-slate-400">Belum ada riwayat.</p> : null}
          </Card>
        </div>
      ) : null}

      <Modal isOpen={baOpen} onClose={closeBa} title="Berita Acara Serah Terima">
        <div className="space-y-4">
          {baLoading ? (
            <p className="text-sm text-slate-500">Memuat berita acara…</p>
          ) : null}

          {baText?.draft_warning ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <TriangleAlert size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">{baText.draft_warning}</p>
            </div>
          ) : null}

          {baText ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{baText.form_code}</span>
                <span>•</span>
                <span>Nomor: {baText.ba_number || '—'}</span>
                <span>•</span>
                <span>Periode {baText.period}</span>
              </div>

              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 scrollbar-thin scrollbar-thumb-slate-300">
                {baText.statements.map((line, i) => (
                  <p key={i} className="text-sm text-slate-800 leading-relaxed">{line}</p>
                ))}
              </div>

              {baText.ppk_penyusun.length > 0 ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">PPK penyusun</p>
                  {baText.ppk_penyusun.map((p) => (
                    <p key={p.officer_name} className="text-sm text-slate-700">
                      {p.officer_name} — {p.total}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <TriangleAlert size={16} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600">
              Berkas PDF dibuat di server saat <strong>Generate</strong> ditekan, lalu
              <strong> dihapus otomatis</strong> begitu jendela ini ditutup agar tidak menumpuk.
              Dokumen bisa dibuat ulang kapan saja dari data yang sudah dibekukan.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 rounded-xl h-12 font-bold"
              onClick={closeBa}>
              Tutup
            </Button>
            <Button
              type="button"
              variant="brandOutline"
              className="flex-1 rounded-xl h-12 font-bold"
              isLoading={generating}
              onClick={handleGenerate}>
              <FileCog size={16} className="mr-1" />
              {generated ? 'Generate Ulang' : 'Generate'}
            </Button>
            <Button
              type="button"
              variant="brand"
              className="flex-1 rounded-xl h-12 font-bold"
              disabled={!generated}
              isLoading={downloading}
              onClick={handleDownload}>
              <Download size={16} className="mr-1" />
              Unduh
            </Button>
          </div>
          {!generated ? (
            <p className="text-xs text-slate-400 text-center">Tombol Unduh aktif setelah Generate ditekan.</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
