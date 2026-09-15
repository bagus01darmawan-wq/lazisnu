'use client';

import React from 'react';
import { AlertTriangle, Loader2, Power } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { ApiResponse, Branch, OverviewResponse } from '@lazisnu/shared-types';
import { Card } from '@/components/ui/Card';
import OverviewHeader from '@/components/overview/OverviewHeader';
import OperationalSummary from '@/components/overview/OperationalSummary';
import ActionRequiredList from '@/components/overview/ActionRequiredList';
import CollectionTrendChart from '@/components/overview/CollectionTrendChart';
import ConditionBreakdown from '@/components/overview/ConditionBreakdown';
import BranchComparisonList from '@/components/overview/BranchComparisonList';

interface ApiError {
  message?: string;
  response?: { data?: { message?: string } };
}

/**
 * Overview kaleng — pusat monitoring operasional untuk dua role.
 *
 * Semua angka berasal dari server (OverviewResponse); tidak ada perhitungan definisi
 * metrik di browser. Scope ditentukan server dari token:
 * - ADMIN_RANTING   : /admin/branch/dashboard (tanpa pemilih ranting)
 * - ADMIN_KECAMATAN : /admin/district/dashboard (opsional branch_id, divalidasi server)
 */
export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const isDistrictAdmin = user?.role === 'ADMIN_KECAMATAN';

  const [data, setData] = React.useState<OverviewResponse | null>(null);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [branchId, setBranchId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fitur backup yang sudah ada — dipertahankan untuk admin kecamatan.
  const [backupActive, setBackupActive] = React.useState(false);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const [backupMessage, setBackupMessage] = React.useState<string | null>(null);

  const handleToggleBackup = async () => {
    try {
      setBackupLoading(true);
      setBackupMessage(null);
      const endpoint = backupActive ? '/admin/backup/stop' : '/admin/backup/start';
      const res = await api.post(endpoint) as unknown as ApiResponse<{ active: boolean; message?: string }>;
      if (res.success && res.data) {
        setBackupActive(res.data.active);
        setBackupMessage(res.data.message ?? (res.data.active ? 'Backup diaktifkan' : 'Backup dinonaktifkan'));
      }
    } catch (err) {
      console.error('Backup toggle error:', err);
      setBackupMessage('Gagal mengubah status backup. Coba lagi.');
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupMessage(null), 4000);
    }
  };

  const fetchOverview = React.useCallback(async (nextBranchId: string, mode: 'first' | 'refresh') => {
    if (mode === 'first') setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // Admin ranting tidak mengirim scope pengganti; admin kecamatan boleh memilih
      // branch_id dan server memvalidasi kepemilikannya.
      const endpoint = isDistrictAdmin
        ? `/admin/district/dashboard${nextBranchId ? `?branch_id=${nextBranchId}` : ''}`
        : '/admin/branch/dashboard';

      const response = await api.get(endpoint) as unknown as ApiResponse<OverviewResponse>;
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error?.message || 'Gagal memuat data overview');
      }
    } catch (err) {
      const errorResponse = err as ApiError;
      setError(
        errorResponse?.response?.data?.message
        || errorResponse?.message
        || 'Terjadi kesalahan koneksi ke server',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDistrictAdmin]);

  // Muat pertama kali / pergantian akun. Tanpa sesi: data scope lama dibuang.
  React.useEffect(() => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    void fetchOverview('', 'first');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDistrictAdmin]);

  // Daftar ranting hanya untuk admin kecamatan.
  React.useEffect(() => {
    if (!isDistrictAdmin) {
      setBranches([]);
      setBranchId('');
      return;
    }
    api.get('/admin/branches')
      .then((res: unknown) => {
        const r = res as ApiResponse<Branch[]>;
        if (r.success && r.data) setBranches(r.data);
      })
      .catch(() => { /* opsional: filter juga tersedia dari daftar perbandingan */ });
  }, [isDistrictAdmin]);

  // Ganti filter ranting: data lama dipertahankan dengan indikator kecil.
  const handleBranchChange = React.useCallback((nextBranchId: string) => {
    setBranchId(nextBranchId);
    void fetchOverview(nextBranchId, 'refresh');
  }, [fetchOverview]);

  const handleRefresh = React.useCallback(() => {
    void fetchOverview(branchId, 'refresh');
  }, [branchId, fetchOverview]);

  // Status backup (infra opsional, gagal senyap).
  React.useEffect(() => {
    api.get('/admin/backup/status')
      .then((res: unknown) => {
        const r = res as ApiResponse<{ active: boolean }>;
        if (r.success && r.data) setBackupActive(r.data.active);
      })
      .catch(() => { /* optional infra, silent fail */ });
  }, []);
  if (loading && !data) {
    // Skeleton mengikuti struktur akhir agar layout tidak meloncat saat data datang.
    return (
      <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Memuat overview kaleng</span>
        <div className="h-24 animate-pulse rounded-2xl bg-[#F4F1EA]/5" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#F4F1EA]/5" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-[#F4F1EA]/5" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-[#F4F1EA]/5" />
          <div className="h-72 animate-pulse rounded-2xl bg-[#F4F1EA]/5" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#F4F1EA]/5 p-8 text-center">
        <p className="text-sm font-bold text-[#F4F1EA]">Sesi tidak ditemukan</p>
        <p className="mt-1 text-xs text-[#F4F1EA]/60">
          Muat ulang halaman untuk masuk kembali. Data scope sebelumnya tidak ditampilkan.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#F4F1EA]/5 p-8 text-center" role="alert">
        <AlertTriangle size={22} className="mx-auto text-[#D97A76]" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-[#F4F1EA]">Gagal memuat overview</p>
        <p className="mt-1 text-xs text-[#F4F1EA]/60">{error}</p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1F8243] px-4 text-sm font-bold text-white transition-[transform,opacity] duration-200 active:scale-[.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B]"
        >
          <Loader2 size={14} aria-hidden="true" /> Coba lagi
        </button>
      </div>
    );
  }

  if (!data) return null;

  const periodEmpty = data.summary.successful_collections === 0 && data.summary.task_total === 0;

  return (
    <div className="flex flex-col gap-6">
      <OverviewHeader
        data={data}
        branches={isDistrictAdmin ? branches : undefined}
        selectedBranchId={branchId}
        onBranchChange={isDistrictAdmin ? handleBranchChange : undefined}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {refreshing && (
        <p className="flex items-center gap-2 text-xs font-semibold text-[#EAD19B]" role="status">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          Memperbarui data untuk scope yang dipilih…
        </p>
      )}

      <OperationalSummary summary={data.summary} branchId={branchId || undefined} />

      {periodEmpty && (
        <p className="rounded-2xl border border-white/10 bg-[#F4F1EA]/5 p-4 text-xs text-[#F4F1EA]/70">
          Belum ada penjemputan dan tugas pada periode ini. Angka di atas menampilkan nol sampai data periode berjalan masuk.
        </p>
      )}

      <ActionRequiredList items={data.action_items} branchId={branchId || undefined} loading={refreshing} />

      {isDistrictAdmin && (
        <Card className="border-white/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${backupActive ? 'bg-[#1F8243]/10 text-[#1F8243]' : 'bg-[#F4F1EA]/5 text-[#F4F1EA]/40'}`}>
                <Power size={20} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#F4F1EA]">Backup Database</p>
                <p className="text-xs text-[#F4F1EA]/50 mt-0.5">
                  {backupActive ? 'Backup otomatis berjalan tiap hari jam 02:00' : 'Backup otomatis sedang dinonaktifkan'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleBackup}
              disabled={backupLoading}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-[opacity,transform] duration-200 active:scale-[.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAD19B] disabled:opacity-60 ${
                backupActive
                  ? 'border border-[#D97A76]/30 bg-[#D97A76]/10 text-[#D97A76]'
                  : 'bg-[#1F8243] text-white'
              }`}
            >
              {backupLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Power size={16} aria-hidden="true" />}
              {backupActive ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
          {backupMessage && (
            <p className={`mt-2 px-1 text-xs ${backupMessage.includes('Gagal') ? 'text-[#D97A76]' : 'text-[#1F8243]'}`}>
              {backupMessage}
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CollectionTrendChart trend={data.monthly_trend} />
        <ConditionBreakdown breakdown={data.condition_breakdown} />
      </div>

      <BranchComparisonList
        comparison={data.branch_comparison ?? []}
        hidden={!isDistrictAdmin || Boolean(branchId)}
        onPickBranch={handleBranchChange}
      />
    </div>
  );
}