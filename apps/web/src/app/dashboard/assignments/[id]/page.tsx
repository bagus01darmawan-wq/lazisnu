'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Repeat,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { ConfirmToast } from '@/components/ui/ConfirmToast';
import { AssignmentCoverage } from '@/components/assignments/AssignmentCoverage';
import { UnassignedQueue } from '@/components/assignments/UnassignedQueue';
import { AssignmentActionBar } from '@/components/assignments/AssignmentActionBar';
import { OfficerPickerSheet } from '@/components/assignments/OfficerPickerSheet';
import { AssignmentConfirmSheet } from '@/components/assignments/AssignmentConfirmSheet';
import { AssignmentTabs } from '@/components/assignments/AssignmentTabs';
import { AssignmentHistoryCard } from '@/components/assignments/AssignmentHistoryCard';
import { AssignmentEmptyState } from '@/components/assignments/AssignmentEmptyState';
import { useAssignmentWorkQueue } from '@/components/assignments/useAssignmentWorkQueue';
import {
  MONTH_NAMES,
  statusLabel,
  statusStyle,
  type AssignmentHistoryItem,
  type AssignmentStatus,
  type AssignmentTab,
  type RegionKind,
} from '@/components/assignments/types';

interface AssignmentPageQuery {
  kind?: string;
  name?: string;
  branch?: string;
  tab?: string;
  year?: string;
  month?: string;
}

interface HistoryResponse {
  success: boolean;
  data?: {
    items?: AssignmentHistoryItem[];
    pagination?: { page: number; limit: number; total: number; totalPages: number };
  };
  items?: AssignmentHistoryItem[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

interface BulkResponse {
  success: boolean;
  assignedCount?: number;
  skippedCount?: number;
  period?: string;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

/** Nilai yang baru berubah setelah pengguna berhenti mengubahnya selama delayMs. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function AssignmentsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<AssignmentPageQuery>;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const routeParams = React.use(params);
  const query = searchParams ? React.use(searchParams) : {};
  const regionId = routeParams.id;
  const regionKind: RegionKind = query.kind === 'dukuh' ? 'dukuh' : 'branch';
  const regionName = query.name ? decodeURIComponent(query.name) : '';
  const regionBranchName = query.branch ? decodeURIComponent(query.branch) : '';

  const initialYear = query.year ? parseInt(query.year, 10) : currentYear;
  const initialMonth = query.month ? parseInt(query.month, 10) : currentMonth;
  const initialTab: AssignmentTab = query.tab === 'riwayat' ? 'riwayat' : 'kelola';

  const [activeTab, setActiveTab] = useState<AssignmentTab>(initialTab);
  const [period, setPeriod] = useState({
    year: Number.isNaN(initialYear) ? currentYear : initialYear,
    month: Number.isNaN(initialMonth) ? currentMonth : initialMonth,
  });

  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [isOfficerSheetOpen, setIsOfficerSheetOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [historyItems, setHistoryItems] = useState<AssignmentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(10);
  // Input pencarian di-buffer lokal; `search` yang men-trigger fetch di-debounce
  // supaya tiap ketikan tidak mengirim request (dan respons lama tidak sempat
  // saling menimpa).
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [officerFilter, setOfficerFilter] = useState('');
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  const [transferring, setTransferring] = useState<AssignmentHistoryItem | null>(null);
  const [transferOfficerId, setTransferOfficerId] = useState('');

  // Penomoran fetch riwayat untuk membuang respons basi (lihat fetchHistory).
  const historyFetchIdRef = useRef(0);

  const { data: queue, loading: queueLoading, error: queueError, reload: reloadQueue } =
    useAssignmentWorkQueue({
      regionId,
      regionKind,
      year: period.year,
      month: period.month,
    });

  const groups = useMemo(() => queue?.groups ?? [], [queue]);
  const officers = useMemo(() => queue?.officers ?? [], [queue]);
  const summary = queue?.summary ?? null;

  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupIds.has(group.id)),
    [groups, selectedGroupIds]
  );
  const selectedCans = selectedGroups.reduce((sum, group) => sum + group.unassignedCans, 0);
  const selectedOfficer = officers.find((officer) => officer.id === selectedOfficerId) ?? null;

  // Prune grup yang hilang setelah refetch/ganti periode.
  useEffect(() => {
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(() => {
      setSelectedGroupIds((previous) => {
        const validIds = new Set(groups.map((group) => group.id));
        const next = new Set(Array.from(previous).filter((id) => validIds.has(id)));
        return next.size === previous.size ? previous : next;
      });
    });
  }, [groups]);

  // Simpan tab + periode di URL agar refresh/back konsisten.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = new URLSearchParams();
    next.set('kind', regionKind);
    if (regionName) next.set('name', regionName);
    if (regionBranchName) next.set('branch', regionBranchName);
    next.set('tab', activeTab);
    next.set('year', String(period.year));
    next.set('month', String(period.month));
    window.history.replaceState(null, '', `/dashboard/assignments/${regionId}?${next.toString()}`);
  }, [activeTab, period.year, period.month, regionId, regionKind, regionName, regionBranchName]);

  // Tombol back (terutama Android) menutup sheet yang terbuka lebih dulu,
  // bukan keluar dari halaman (rencana §9): saat sheet terbuka kita menumpuk
  // satu entri history dan popstate menutup sheetnya. Penutupan lewat
  // tombol/Escape/sukses membersihkan entri tumpukan itu sendiri.
  const anySheetOpen = isOfficerSheetOpen || isConfirmOpen || !!transferring;
  const submittingRef = useRef(submitting);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);
  useEffect(() => {
    if (!anySheetOpen || typeof window === 'undefined') return;
    window.history.pushState(
      // Pertahankan state internal Next.js pada entri ini.
      { ...(window.history.state ?? {}), assignmentSheetOpen: true },
      ''
    );
    const handlePopState = () => {
      if (submittingRef.current) {
        // Submit sedang berjalan: sheet tidak boleh tertutup — kembalikan
        // entri history yang baru tertelan.
        window.history.pushState(
          { ...(window.history.state ?? {}), assignmentSheetOpen: true },
          ''
        );
        return;
      }
      setIsOfficerSheetOpen(false);
      setIsConfirmOpen(false);
      setTransferring(null);
      setTransferOfficerId('');
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Ditutup bukan lewat Back: buang entri yang kita tumpuk agar Back
      // berikutnya tidak mendarat di entri kosong.
      if (window.history.state?.assignmentSheetOpen) {
        window.history.back();
      }
    };
  }, [anySheetOpen]);

  const fetchHistory = useCallback(async () => {
    // Pengaman out-of-order: respons dari fetch yang sudah basi (terlampaui
    // fetch lebih baru, mis. saat filter diganti cepat) dibuang, tidak
    // menimpa hasil terbaru.
    const fetchId = ++historyFetchIdRef.current;
    setHistoryLoading(true);
    try {
      const response = (await api.get('/admin/assignments', {
        params: {
          year: period.year,
          month: period.month,
          search: search || undefined,
          status: statusFilter || undefined,
          officer_id: officerFilter || undefined,
          ...(regionKind === 'dukuh' ? { dukuh_id: regionId } : { branch_id: regionId }),
          page: historyPage,
          limit: historyLimit,
        },
      })) as unknown as HistoryResponse;

      if (fetchId !== historyFetchIdRef.current) return;
      if (response.success) {
        setHistoryItems(response.data?.items || response.items || []);
        setHistoryTotal(
          response.data?.pagination?.total || response.pagination?.total || 0
        );
      }
    } catch (error) {
      if (fetchId !== historyFetchIdRef.current) return;
      const message =
        (error as { error?: { message?: string }; message?: string })?.error?.message ||
        (error as { message?: string })?.message ||
        'Gagal memuat riwayat penugasan';
      toast.error(message);
    } finally {
      if (fetchId === historyFetchIdRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [
    period.year,
    period.month,
    search,
    statusFilter,
    officerFilter,
    regionKind,
    regionId,
    historyPage,
    historyLimit,
  ]);

  useEffect(() => {
    if (activeTab !== 'riwayat') return;
    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(fetchHistory);
  }, [activeTab, fetchHistory, historyReloadKey]);

  const changePeriod = (month: number, year: number) => {
    setPeriod({ year, month });
    setSelectedGroupIds(new Set());
    setSelectedOfficerId('');
    setHistoryPage(1);
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleAllGroups = () => {
    setSelectedGroupIds((previous) => {
      if (groups.length > 0 && groups.every((group) => previous.has(group.id))) {
        return new Set();
      }
      return new Set(groups.map((group) => group.id));
    });
  };

  const openConfirm = () => {
    if (selectedGroups.length === 0 || !selectedOfficer) {
      toast.error('Pilih grup dan petugas terlebih dahulu');
      return;
    }
    setIsConfirmOpen(true);
  };

  const submitAssignment = async () => {
    if (!queue || !selectedOfficer) return;
    setSubmitting(true);
    let assignedTotal = 0;

    try {
      const dukuhIds = selectedGroups.filter((group) => group.kind === 'dukuh').map((group) => group.id);
      const canIds = selectedGroups.flatMap((group) => group.canIds ?? []);

      if (dukuhIds.length > 0) {
        const response = (await api.post('/admin/assignments/bulk-branch', {
          branch_id: queue.region.branchId,
          officer_id: selectedOfficer.id,
          dukuh_ids: dukuhIds,
          period_year: period.year,
          period_month: period.month,
        })) as unknown as BulkResponse;
        assignedTotal += response.assignedCount || 0;
      }

      if (canIds.length > 0) {
        const response = (await api.post('/admin/assignments/bulk-cans', {
          officer_id: selectedOfficer.id,
          can_ids: Array.from(new Set(canIds)),
          period_year: period.year,
          period_month: period.month,
        })) as unknown as BulkResponse;
        assignedTotal += response.assignedCount || 0;
      }

      setIsConfirmOpen(false);
      setSelectedGroupIds(new Set());
      setHistoryReloadKey((key) => key + 1);
      reloadQueue();
      toast.success(
        `${assignedTotal} kaleng berhasil ditugaskan ke ${selectedOfficer.fullName} untuk ${MONTH_NAMES[period.month - 1]} ${period.year}`
      );
    } catch (error) {
      const message =
        (error as { error?: { message?: string }; message?: string })?.error?.message ||
        (error as { message?: string })?.message ||
        'Gagal menyimpan penugasan';
      if (assignedTotal > 0) {
        // Sebagian berhasil: refetch akan otomatis mem-prune grup yang sudah
        // ditugaskan; selection sengaja tidak dikosongkan supaya grup yang
        // gagal bisa langsung diulang tanpa mencentang ulang.
        setIsConfirmOpen(false);
        reloadQueue();
        toast.warning(
          `${assignedTotal} kaleng berhasil ditugaskan, sebagian gagal: ${message}`
        );
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferring || !transferOfficerId) return;
    setSubmitting(true);
    try {
      const response = (await api.post(`/admin/assignments/${transferring.id}/transfer`, {
        officer_id: transferOfficerId,
      })) as unknown as { success: boolean };
      if (response.success) {
        setTransferring(null);
        setTransferOfficerId('');
        fetchHistory();
        reloadQueue();
        toast.success('Penugasan berhasil ditransfer');
      }
    } catch (error) {
      const message =
        (error as { error?: { message?: string }; message?: string })?.error?.message ||
        (error as { message?: string })?.message ||
        'Gagal mentransfer penugasan';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (toast as any).custom(
      (t: string | number) => (
        <ConfirmToast
          id={t}
          title="Hapus Penugasan?"
          description="Jadwal penjemputan kaleng ini pada periode berjalan akan dibatalkan."
          confirmLabel="Ya, Hapus"
          onConfirm={async () => {
            try {
              const response = (await api.delete(`/admin/assignments/${id}`)) as unknown as {
                success: boolean;
              };
              if (response.success) {
                fetchHistory();
                reloadQueue();
                toast.success('Penugasan berhasil dihapus');
              }
            } catch (error) {
              const message =
                (error as { error?: { message?: string }; message?: string })?.error?.message ||
                (error as { message?: string })?.message ||
                'Gagal menghapus penugasan';
              toast.error(message);
            }
          }}
          variant="danger"
        />
      ),
      { duration: 5000 }
    );
  };

  const columns: ColumnDef<AssignmentHistoryItem>[] = [
    {
      accessorKey: 'can',
      header: () => (
        <div className="flex items-center gap-1.5">
          <ClipboardList size={12} className="text-[#EAD19B]" />
          <span>Pemilik / Kaleng</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <p className="font-bold tracking-tight text-[#F4F1EA]">{row.original.can.ownerName}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[#EAD19B]/60">
            #{row.original.can.qrCode}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'address',
      header: () => (
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="text-[#EAD19B]" />
          <span>Dukuh</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col text-xs font-medium text-[#F4F1EA]/60">
          <span className="uppercase tracking-tight">
            {row.original.can.dukuhName || row.original.can.dukuh || '-'}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest opacity-50">
            RT {row.original.can.rt || '-'} / RW {row.original.can.rw || '-'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'officer',
      header: () => (
        <div className="flex items-center gap-1.5">
          <UserCheck size={12} className="text-[#EAD19B]" />
          <span>Petugas</span>
        </div>
      ),
      cell: ({ row }) => (
        <span className="font-bold text-[#F4F1EA]">{row.original.officer.fullName}</span>
      ),
    },
    {
      accessorKey: 'period',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-[#EAD19B]" />
          <span>Periode</span>
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-xs font-medium uppercase tracking-tight text-[#F4F1EA]/60">
          {MONTH_NAMES[row.original.periodMonth - 1]} {row.original.periodYear}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: () => (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-[#EAD19B]" />
          <span>Status</span>
        </div>
      ),
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusStyle(
            row.original.status
          )}`}
        >
          {statusLabel(row.original.status)}
        </span>
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
            disabled={row.original.status !== 'ACTIVE'}
            className="group h-8 w-8 rounded-lg border-white/10 bg-white/5 p-0 text-[#F4F1EA]/60 transition-all hover:bg-white/10 hover:text-[#F4F1EA] disabled:cursor-not-allowed disabled:opacity-30"
            title={
              row.original.status === 'ACTIVE'
                ? 'Transfer Penugasan'
                : 'Hanya penugasan aktif yang dapat ditransfer'
            }
            onClick={() => {
              setTransferring(row.original);
              setTransferOfficerId('');
            }}
          >
            <Repeat size={14} className="text-[#EAD19B]" />
          </Button>
          {user?.role === 'ADMIN_KECAMATAN' && (
            <Button
              variant="outline"
              size="sm"
              className="group h-8 w-8 rounded-lg border-white/10 bg-white/5 p-0 text-[#F4F1EA]/60 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-[#D97A76]"
              title="Hapus Penugasan"
              onClick={() => handleDelete(row.original.id)}
            >
              <Trash2 size={14} className="text-[#F4F1EA]/40 group-hover:text-[#D97A76]" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const displayName = (queue?.region.name || regionName || 'Penugasan Rutin')
    .replace(/ranting/gi, '')
    .trim()
    .toUpperCase();

  const totalHistoryPages = Math.max(1, Math.ceil(historyTotal / historyLimit));

  const renderKelola = () => {
    if (queueError) {
      return (
        <AssignmentEmptyState
          variant="error"
          title="Gagal memuat ruang kerja"
          description={queueError}
          primaryLabel="Coba lagi"
          onPrimary={reloadQueue}
        />
      );
    }

    if (!queueLoading && summary) {
      if (summary.totalCans === 0) {
        return (
          <AssignmentEmptyState
            variant="no-cans"
            title="Belum ada kaleng terdaftar"
            description="Wilayah ini belum memiliki kaleng. Tambahkan kaleng terlebih dahulu agar bisa ditugaskan."
            primaryLabel="Buka Kelola Kaleng"
            onPrimary={() => router.push('/dashboard/cans')}
          />
        );
      }

      if (summary.assignableCans === 0) {
        return (
          <AssignmentEmptyState
            variant="no-cans"
            title="Tidak ada kaleng yang dapat ditugaskan"
            description={`${summary.nonAssignableCans} kaleng di wilayah ini berstatus non-aktif atau dikembalikan, sehingga tidak ikut penugasan.`}
            primaryLabel="Buka Kelola Kaleng"
            onPrimary={() => router.push('/dashboard/cans')}
          />
        );
      }

      if (summary.activeOfficerCount === 0) {
        return (
          <AssignmentEmptyState
            variant="no-officers"
            title="Belum ada petugas aktif"
            description="Tambahkan petugas aktif di wilayah ini sebelum mulai menugaskan kaleng."
            primaryLabel="Buka Data Petugas"
            onPrimary={() => router.push('/dashboard/users')}
          />
        );
      }

      if (summary.unassignedAssignableCans === 0) {
        return (
          <AssignmentEmptyState
            variant="all-assigned"
            title="Semua sudah ditugaskan"
            description={`${summary.assignableCans} kaleng di ${displayName} sudah punya petugas untuk ${MONTH_NAMES[period.month - 1]} ${period.year}.`}
            primaryLabel="Lihat Riwayat"
            onPrimary={() => setActiveTab('riwayat')}
            secondaryLabel="Ganti Periode"
            onSecondary={() => {
              const nextMonth = period.month === 12 ? 1 : period.month + 1;
              const nextYear = period.month === 12 ? period.year + 1 : period.year;
              changePeriod(nextMonth, nextYear);
            }}
          />
        );
      }
    }

    return (
      <>
        <AssignmentCoverage summary={summary} loading={queueLoading} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <UnassignedQueue
            groups={groups}
            selectedIds={selectedGroupIds}
            onToggle={toggleGroup}
            onToggleAll={toggleAllGroups}
            loading={queueLoading}
            error={queueError}
            onRetry={reloadQueue}
          />

          <aside className="hidden lg:block">
            <div className="rounded-2xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <Users size={14} className="text-[#EAD19B]" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/50">
                  Petugas & beban kerja
                </p>
              </div>
              {officers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[#F4F1EA]/40">
                  Belum ada petugas aktif
                </p>
              ) : (
                <ul className="max-h-[420px] space-y-1 overflow-y-auto p-2">
                  {officers.map((officer) => {
                    const selected = officer.id === selectedOfficerId;
                    return (
                      <li key={officer.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedOfficerId(officer.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                            selected
                              ? 'border-[#EAD19B]/60 bg-[#EAD19B]/10'
                              : 'border-transparent hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-bold text-[#F4F1EA]">
                              {officer.fullName}
                            </span>
                            <span className="shrink-0 text-[10px] font-black text-[#EAD19B]">
                              {officer.assignedCount}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-[#F4F1EA]/40">
                            {officer.completedCount} selesai · {officer.uncollectedCount} terlewat
                            {officer.dukuhName ? ` · ${officer.dukuhName}` : ''}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <AssignmentActionBar
          selectedGroups={selectedGroups.length}
          selectedCans={selectedCans}
          officer={selectedOfficer}
          hasOfficers={officers.length > 0}
          submitting={submitting}
          onOpenOfficer={() => setIsOfficerSheetOpen(true)}
          onSubmit={openConfirm}
        />
      </>
    );
  };

  const renderRiwayat = () => (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:p-5">
        <div className="group relative w-full lg:w-80">
          <div className="flex h-[35px] items-center rounded-2xl border border-white/20 bg-white/10 p-1 backdrop-blur-md transition-all duration-500 group-focus-within:border-[#F4F1EA]/30 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20">
            <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
              <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
            </div>
            <input
              type="text"
              placeholder="Cari pemilik / QR / petugas..."
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setHistoryPage(1);
              }}
              className="w-full bg-transparent px-3 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <GlassSelect
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setHistoryPage(1);
            }}
            placeholder="Semua status"
            className="w-full sm:w-[170px]"
            options={[
              { label: 'SEMUA STATUS', value: '' },
              { label: 'ASSIGNED', value: 'ACTIVE' satisfies AssignmentStatus },
              { label: 'SELESAI', value: 'COMPLETED' satisfies AssignmentStatus },
              { label: 'RE-ASSIGN', value: 'REASSIGNED' satisfies AssignmentStatus },
              { label: 'TERLEWAT', value: 'UNCOLLECTED' satisfies AssignmentStatus },
            ]}
          />

          <GlassSelect
            value={officerFilter}
            onChange={(value) => {
              setOfficerFilter(value);
              setHistoryPage(1);
            }}
            placeholder="Semua petugas"
            className="w-full sm:w-[190px]"
            options={[
              { label: 'SEMUA PETUGAS', value: '' },
              ...officers.map((officer) => ({
                label: officer.fullName,
                value: officer.id,
              })),
            ]}
          />

          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setStatusFilter('');
              setOfficerFilter('');
              setHistoryPage(1);
            }}
            className="flex h-[36px] items-center gap-2 rounded-2xl border border-[#F4F1EA]/20 bg-[#F4F1EA]/10 px-5 text-xs font-bold text-white/90 backdrop-blur-md transition-all duration-300 hover:bg-[#F4F1EA]/20 active:scale-95"
          >
            <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
            Reset
          </button>
        </div>
      </div>

      {historyLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : historyItems.length === 0 ? (
        <AssignmentEmptyState
          variant="no-groups"
          title="Belum ada riwayat"
          description="Tidak ada penugasan yang cocok dengan periode dan filter ini."
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {historyItems.map((item) => (
              <AssignmentHistoryCard
                key={item.id}
                item={item}
                canDelete={user?.role === 'ADMIN_KECAMATAN'}
                onTransfer={(selected) => {
                  setTransferring(selected);
                  setTransferOfficerId('');
                }}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <Card
            variant="glass"
            className="hidden overflow-hidden border-white/5 p-0 shadow-2xl md:block"
          >
            <div className="w-full overflow-x-auto custom-scrollbar">
              <Table columns={columns} data={historyItems} loading={false} variant="glass" />
            </div>
          </Card>
        </>
      )}

      {!historyLoading && historyTotal > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Menampilkan {historyItems.length} dari {historyTotal}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
              className="h-9 rounded-xl border-white/10 text-xs font-bold"
            >
              Sebelumnya
            </Button>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/60">
              {historyPage} / {totalHistoryPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={historyPage >= totalHistoryPages}
              onClick={() => setHistoryPage((page) => page + 1)}
              className="h-9 rounded-xl border-white/10 text-xs font-bold"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4 pb-28 md:space-y-6 lg:pb-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/assignments')}
            aria-label="Kembali ke daftar wilayah"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#F4F1EA]/70 transition-all hover:bg-white/10 hover:text-[#F4F1EA] active:scale-95"
          >
            <ArrowLeft size={16} />
          </button>
          <ClipboardList className="hidden shrink-0 text-[#EAD19B] sm:block" size={28} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-[#F4F1EA] md:text-2xl">
              {displayName}
            </h1>
            <p className="truncate text-xs font-medium text-[#F4F1EA]/60 md:text-sm">
              {activeTab === 'kelola'
                ? `Kelola penugasan · ${summary?.totalCans ?? 0} kaleng · ${summary?.activeOfficerCount ?? 0} petugas`
                : 'Riwayat penugasan'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 md:justify-end">
          <PeriodPicker
            months={[period.month]}
            year={period.year}
            onChange={(months, year) => changePeriod(months[0] || period.month, year)}
          />
        </div>
      </div>

      <AssignmentTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        historyCount={historyTotal}
      />

      <div
        role="tabpanel"
        id={`assignment-panel-${activeTab}`}
        aria-labelledby={`assignment-tab-${activeTab}`}
        className="space-y-4 md:space-y-6"
      >
        {activeTab === 'kelola' ? renderKelola() : renderRiwayat()}
      </div>

      <OfficerPickerSheet
        open={isOfficerSheetOpen}
        officers={officers}
        selectedId={selectedOfficerId}
        onSelect={setSelectedOfficerId}
        onClose={() => setIsOfficerSheetOpen(false)}
      />

      <AssignmentConfirmSheet
        open={isConfirmOpen}
        regionName={displayName}
        year={period.year}
        month={period.month}
        groupCount={selectedGroups.length}
        canCount={selectedCans}
        officer={selectedOfficer}
        submitting={submitting}
        onConfirm={submitAssignment}
        onClose={() => setIsConfirmOpen(false)}
      />

      <Modal
        isOpen={!!transferring}
        onClose={() => {
          setTransferring(null);
          setTransferOfficerId('');
        }}
        title="Transfer Penugasan"
        variant="glass"
        position="bottom"
      >
        {transferring && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
                  Kaleng / Pemilik
                </span>
                <span className="truncate text-xs font-bold text-[#F4F1EA]">
                  {transferring.can.ownerName} · #{transferring.can.qrCode}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
                  Petugas saat ini
                </span>
                <span className="truncate text-xs font-bold text-[#D97A76]">
                  {transferring.officer.fullName}
                </span>
              </div>
            </div>

            <GlassSelect
              value={transferOfficerId}
              onChange={setTransferOfficerId}
              placeholder="-- Pilih Petugas Pengganti --"
              label="Petugas Pengganti"
              options={officers
                .filter((officer) => officer.id !== transferring.officerId)
                .map((officer) => ({
                  label: `${officer.fullName} (${officer.employeeCode})`,
                  value: officer.id,
                }))}
            />

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTransferring(null);
                  setTransferOfficerId('');
                }}
                className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-[#F4F1EA]/70 transition-all hover:bg-white/10 active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleTransfer}
                disabled={!transferOfficerId || submitting}
                className="h-11 flex-1 rounded-xl bg-[#EAD19B] text-xs font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95 disabled:opacity-40"
              >
                Konfirmasi Transfer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
