'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
/* import { Badge } from '@/components/ui/Badge'; */
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cleanBranchName } from '@/lib/formatters';
import { ConfirmToast } from '@/components/ui/ConfirmToast';
import {
  Box,
  Plus,
  Search,
  QrCode,
  Edit,
  Trash2,
  MapPin,
  Phone,
  Filter,
  RefreshCcw,
  RotateCcw,
  CheckSquare,
  Square,
  AlertTriangle,
  Printer,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { Card } from '@/components/ui/Card';
import { ApiResponse, PaginatedResponse } from '@lazisnu/shared-types';

/**
 * Bentuk kaleng di sisi web (camelCase — hasil normalisasi caseConverter).
 * Payload keluar (POST/PUT) tetap snake_case sesuai kontrak backend.
 */
interface CanExtended {
  id: string;
  qrCode?: string;
  branchId: string;
  dukuhId?: string;
  ownerName: string;
  dukuh?: string;
  rt?: string;
  rw?: string;
  ownerWhatsapp: string;
  isActive: boolean;
  condition?: string;
  assignments?: {
    id: string;
    status: 'ACTIVE' | 'COMPLETED' | 'REASSIGNED';
  }[];
  branch?: {
    name: string;
  } | null;
  dukuhDetails?: {
    name: string;
  } | null;
}

interface Branch {
  id: string;
  name: string;
}

interface Dukuh {
  id: string;
  branchId?: string;
  name: string;
}

interface QrPreviewItem {
  qrCode: string;
  ownerName?: string;
  qrImageUrl: string;
}

interface QrResponseData {
  qrCode?: string;
  qrImageUrl?: string;
  printUrl: string;
  count?: number;
  previews?: QrPreviewItem[];
}

interface ApiError {
  message?: string;
  error?: {
    message?: string;
  };
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
}

/**
 * Kolom STATUS di halaman ini menjawab satu pertanyaan saja: "aset ini dalam
 * kondisi apa?". Sumbunya KONDISI (`cans.condition`), bukan status tugas.
 * Status tugas (ASSIGNED/SELESAI/RE-ASSIGN/TERLEWAT) milik halaman Penugasan —
 * dulu dua sumbu itu dicampur di satu kolom sehingga kaleng RUSAK/HILANG/
 * NON_AKTIF tampil "AKTIF" hanya karena `is_active` masih true.
 * Label mengikuti CONDITION_LABELS di backend (`services/conditionRules.ts`).
 *
 * `hint` = keterangan kecil di bawah label. Fungsinya mencegah salah paham yang
 * paling mahal: RUSAK dan HILANG **tetap masuk daftar penjemputan** (lihat
 * ASSIGNABLE_CONDITIONS), jadi tanpa keterangan orang mengira kalengnya mati.
 * Kalimatnya diambil dari aturan backend, bukan dikarang: "tetap dijemput" =
 * ASSIGNABLE_CONDITIONS, "ganti unit"/"beri kaleng baru" = ACTION_LABELS.
 * Baris AKTIF sengaja TANPA hint — itu keadaan normal, tidak perlu dijelaskan.
 */
const CONDITION_STYLE: Record<string, { label: string; className: string; hint?: string }> = {
  AKTIF: { label: 'AKTIF', className: 'text-[#1F8243]' },
  NON_AKTIF: { label: 'NON-AKTIF', className: 'text-[#EAD19B]', hint: 'dijeda · kunjungi untuk verifikasi' },
  RUSAK: { label: 'RUSAK', className: 'text-[#DE6F4A]', hint: 'tetap dijemput · ganti unit' },
  HILANG: { label: 'HILANG', className: 'text-[#D97A76]', hint: 'tetap dijemput · beri kaleng baru' },
  DIKEMBALIKAN: { label: 'DIKEMBALIKAN', className: 'text-[#F4F1EA]/40', hint: 'keluar dari pelacakan' },
};

/**
 * Kaleng yang sudah keluar dari pelacakan (`is_active = false`, kondisi
 * DIKEMBALIKAN) — satu-satunya yang boleh dihapus permanen. Dipakai bersama oleh
 * aksi baris, aksi massal, dan tombol di bilah aksi agar ketiganya tidak pernah
 * berbeda pendapat.
 */
function isReturnedCan(can: { condition?: string; isActive: boolean }): boolean {
  return can.condition === 'DIKEMBALIKAN' || !can.isActive;
}

const canSchema = z.object({
  owner_name: z.string().min(1, 'Nama pemilik wajib diisi'),
  branch_id: z.string().uuid('Pilih ranting'),
  dukuh_id: z.string().uuid('Pilih dukuh'),
  rt: z.string().min(1, 'Pilih RT'),
  rw: z.string().min(1, 'Pilih RW'),
  owner_whatsapp: z.string().min(10, 'Nomor WhatsApp minimal 10 digit'),
});

type CanFormValues = z.infer<typeof canSchema>;

export default function CansDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ kind?: string; name?: string; branch?: string }> }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const routeParams = React.use(params);
  const query = searchParams ? React.use(searchParams) : {};
  const regionId = routeParams.id;
  const regionKind = query.kind === 'dukuh' ? 'dukuh' : 'branch';
  const regionName = query.name ? decodeURIComponent(query.name) : '';
  const regionBranchName = query.branch ? decodeURIComponent(query.branch) : '';
  const [data, setData] = useState<CanExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCan, setEditingCan] = useState<CanExtended | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dukuhs, setDukuhs] = useState<Dukuh[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination & Filter states
  /**
   * Satu sumber kebenaran untuk kondisi filter saat halaman pertama dibuka.
   * Deklarasi `useState` dan handler Reset membaca nilai yang SAMA, jadi Reset
   * tidak mungkin mengembalikan ke keadaan berbeda dari pembukaan halaman.
   * Wilayah TIDAK diikutkan — itu dikunci dari URL, bukan filter yang bisa
   * di-reset oleh pengguna.
   */
  const FILTER_AWAL = {
    search: '',
    // Halaman dibuka pada kaleng AKTIF (kondisi AKTIF = aktif dan baik).
    // Konsekuensinya disengaja: kaleng RUSAK/HILANG/NON-AKTIF/DIKEMBALIKAN tidak
    // ikut tampil sampai filter diganti — itu tugas filter, bukan daftar utama.
    statusFilter: 'AKTIF',
    currentPage: 1,
    pageSize: 10,
  };
  const [search, setSearch] = useState(FILTER_AWAL.search);
  // Wilayah dikunci dari URL (hasil klik kartu di halaman index).
  // Kartu ranting menyaring branch_id, kartu dukuh menyaring dukuh_id.
  const regionQuery = regionKind === 'dukuh'
    ? { dukuh_id: regionId }
    : { branch_id: regionId };
  const [statusFilter, setStatusFilter] = useState(FILTER_AWAL.statusFilter);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(FILTER_AWAL.currentPage);
  const [pageSize, setPageSize] = useState(FILTER_AWAL.pageSize);

  // Halaman detail: wilayah selalu terkunci dari URL, tidak ada state kartu.

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importBranchId, setImportBranchId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  // QR Print States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<QrResponseData | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isBulkPrint, setIsBulkPrint] = useState(false);
  const [qrIndex, setQrIndex] = useState(0);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CanFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(canSchema as any),
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedBranchId = watch('branch_id');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/cans', {
        params: {
          search,
          ...regionQuery,
          status: statusFilter,
          page: currentPage,
          limit: pageSize
        }
      }) as unknown as ApiResponse<PaginatedResponse<CanExtended>>;
      if (response.success && response.data) {
        setData(response.data.items || []);
        setTotalItems(response.data.pagination?.total || 0);
        setSelectedIds([]); // Reset selection on data fetch
      }
    } catch (error) {
      console.error('Failed to fetch cans:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await api.get('/admin/branches') as unknown as ApiResponse<Branch[]>;
      if (response.success && response.data) {
        setBranches(response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchDukuhs = async (branchId: string) => {
    if (!branchId) {
      setDukuhs([]);
      return;
    }
    try {
      const response = await api.get('/admin/dukuhs', { params: { branch_id: branchId } }) as unknown as ApiResponse<Dukuh[]>;
      if (response.success && response.data) {
        setDukuhs(response.data || []);
      }
    } catch (error) {
      const err = error as ApiError;
      console.error('Failed to fetch dukuhs:', err.response?.data || err.message || err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, regionId, regionKind, statusFilter, currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchDukuhs(selectedBranchId);
  }, [selectedBranchId]);

  const onSubmit = async (values: CanFormValues) => {
    try {
      // ADMIN_RANTING tidak boleh pindah ranting: kunci ke branch asal.
      const payloadBranchId = user?.role === 'ADMIN_RANTING' && editingCan
        ? editingCan.branchId
        : values.branch_id;
      const payload = {
        owner_name: values.owner_name,
        owner_whatsapp: values.owner_whatsapp,
        branch_id: payloadBranchId,
        dukuh_id: values.dukuh_id,
        rt: values.rt,
        rw: values.rw,
        owner_address: '',
      };

      if (editingCan) {
        const isBranchMove = payloadBranchId !== editingCan.branchId;
        const response = await api.put(`/admin/cans/${editingCan.id}`, payload) as unknown as ApiResponse<CanExtended>;
        if (response.success) {
          const movedBranchName = isBranchMove
            ? branches.find((b) => b.id === payloadBranchId)?.name
            : null;
          setIsModalOpen(false);
          setEditingCan(null);
          if (isBranchMove && regionKind === 'branch') {
            // Datanya sudah pindah ranting — kembali ke daftar kartu.
            router.push('/dashboard/cans');
            return;
          } else {
            await fetchData();
          }
          toast.success(movedBranchName
            ? `Data kaleng berhasil dipindahkan ke ${cleanBranchName(movedBranchName)}`
            : 'Data kaleng berhasil diperbarui');
        }
      } else {
        const response = await api.post('/admin/cans', payload) as unknown as ApiResponse<CanExtended>;
        if (response.success) {
          setIsModalOpen(false);
          reset();
          await fetchData();
          toast.success('Kaleng baru berhasil ditambahkan');
        }
      }
    } catch (error) {
      const err = error as ApiError;
      toast.error(err.error?.message || err.message || 'Gagal menyimpan data');
    }
  };

  const handleEdit = (can: CanExtended) => {
    setEditingCan(can);
    setValue('owner_name', can.ownerName);
    setValue('branch_id', can.branchId);
    setValue('dukuh_id', can.dukuhId || '');
    setValue('rt', can.rt || '');
    setValue('rw', can.rw || '');
    setValue('owner_whatsapp', can.ownerWhatsapp || '');
    setIsModalOpen(true);
  };

  /**
   * Pilihan massal hanya boleh dihapus permanen bila SELURUH baris terpilih
   * sudah DIKEMBALIKAN. Dipakai bersama oleh handler dan oleh tombol di bilah
   * aksi, supaya label tombol tidak pernah berbeda dari aksi yang dijalankan.
   */
  const isBulkPermanentSelection = () => {
    const selectedRows = data.filter((row) => selectedIds.includes(row.id));
    return selectedRows.length > 0 && selectedRows.every(isReturnedCan);
  };

  const handleDelete = async (id: string, isPermanentRow?: boolean) => {
    // Hapus permanen HANYA untuk kaleng yang sudah DIKEMBALIKAN (is_active=false).
    // Dulu filter yang sedang aktif ikut menentukan jenis aksi: memilih filter
    // NON-AKTIF membuat SEMUA baris di layar menjadi hapus permanen, padahal
    // NON_AKTIF adalah kondisi sementara ("kunjungi untuk verifikasi") — kaleng
    // yang paling mungkin kembali aktif justru yang paling mudah dihapus.
    const isPermanent = isPermanentRow === true;

    toast.custom((t: string | number) => (
      <ConfirmToast
        id={t}
        title={isPermanent ? "Hapus Permanen?" : "Tandai Dikembalikan?"}
        description={isPermanent
          ? "Data akan hilang selamanya and tidak dapat dikembalikan."
          : "Kaleng keluar dari daftar penjemputan dan dicatat sebagai dikembalikan. Bisa diaktifkan kembali kapan saja."}
        confirmLabel={isPermanent ? "Hapus Permanen" : "Ya, Dikembalikan"}
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/cans/${id}${isPermanent ? '?permanent=true' : ''}`).then((res) => {
              void fetchData();
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isPermanent ? 'Data kaleng berhasil dihapus permanen' : 'Kaleng ditandai dikembalikan',
              error: (err: ApiError) => err.error?.message || err.message || 'Gagal memproses penghapusan',
            }
          )
        }}
        variant={isPermanent ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    // Massal: permanen hanya bila SELURUH pilihan sudah DIKEMBALIKAN. Pilihan
    // campuran diperlakukan sebagai penandaan dikembalikan — aman, bisa dibatalkan.
    const isPermanentBulk = isBulkPermanentSelection();

    toast.custom((t: string | number) => (
      <ConfirmToast
        id={t}
        title={isPermanentBulk ? "Hapus Massal?" : "Tandai Dikembalikan Massal?"}
        description={isPermanentBulk
          ? `Hapus permanen ${selectedIds.length} kaleng terpilih?`
          : `Tandai ${selectedIds.length} kaleng terpilih sebagai dikembalikan?`}
        confirmLabel={isPermanentBulk ? "Hapus Permanen" : "Ya, Dikembalikan"}
        onConfirm={() => {
          toast.promise(
            api.post('/admin/cans/bulk-delete', {
              ids: selectedIds,
              permanent: isPermanentBulk
            }).then((res) => {
              void fetchData();
              setSelectedIds([]);
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isPermanentBulk
                ? `Berhasil menghapus permanen ${selectedIds.length} kaleng`
                : `Berhasil menandai ${selectedIds.length} kaleng sebagai dikembalikan`,
              error: (err: ApiError) => err.message || 'Gagal menghapus data masal',
            }
          )
        }}
        variant={isPermanentBulk ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const handleGenerateQr = async (can: CanExtended) => {
    setIsGeneratingQr(true);
    setIsQrModalOpen(true);
    setIsBulkPrint(false);
    setQrData(null);
    setQrIndex(0);
    try {
      const response = await api.post(`/admin/cans/${can.id}/generate-qr`) as unknown as ApiResponse<QrResponseData>;
      if (response.success && response.data) {
        setQrData(response.data);
      }
    } catch (error) {
      const err = error as ApiError;
      toast.error(err.message || 'Gagal membuat QR Code');
      setIsQrModalOpen(false);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const handleBulkGenerateQr = async () => {
    if (selectedIds.length === 0) return;
    setIsGeneratingQr(true);
    setIsQrModalOpen(true);
    setIsBulkPrint(true);
    setQrData(null);
    setQrIndex(0);
    try {
      const response = await api.post(`/admin/cans/bulk-generate-qr`, { ids: selectedIds }) as unknown as ApiResponse<QrResponseData>;
      if (response.success && response.data) {
        setQrData(response.data);
      }
    } catch (error) {
      const err = error as ApiError;
      toast.error(err.message || 'Gagal membuat QR Code masal');
      setIsQrModalOpen(false);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const toggleSelectAll = () => {
    const selectableData = data.filter(item => !(item.assignments && item.assignments.length > 0));

    if (selectableData.length === 0) return;

    if (selectedIds.length === selectableData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableData.map(item => item.id));
    }
  };

  const toggleSelectId = (item: CanExtended) => {
    const isAssigned = item.assignments && item.assignments.length > 0;
    if (isAssigned) return;

    setSelectedIds(prev =>
      prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]
    );
  };

  const handleImport = async () => {
    if (!importBranchId) return toast.error('Pilih ranting terlebih dahulu');
    if (!importFile) return toast.error('Pilih file CSV terlebih dahulu');

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');

        if (lines.length === 0) throw new Error('File kosong');

        // Skip header if it exists
        const hasHeader = lines[0].toLowerCase().includes('nama');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Fetch dukuhs for mapping
        const dukuhsRes = await api.get('/admin/dukuhs', { params: { branch_id: importBranchId } }) as unknown as ApiResponse<Dukuh[]>;
        const branchDukuhs = dukuhsRes.data || [];

        const items = dataLines.map(line => {
          // Detect separator automatically (comma or semicolon)
          const separator = line.includes(';') ? ';' : ',';
          const columnsData = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));

          const ownerName = columnsData[0];
          const ownerWhatsapp = columnsData[1];
          const dukuhName = columnsData[2];
          const rt = columnsData[3] || '';
          const rw = columnsData[4] || '';

          // Find dukuh ID by name
          const dukuh = branchDukuhs.find((d: Dukuh) => d.name.toUpperCase() === dukuhName?.toUpperCase());

          return {
            owner_name: ownerName,
            owner_whatsapp: ownerWhatsapp,
            dukuh_id: dukuh?.id,
            dukuh: dukuhName,
            rt: rt,
            rw: rw
          };
        }).filter(item => item.owner_name && item.owner_name !== '' && item.owner_whatsapp && item.owner_whatsapp !== '');

        if (items.length === 0) {
          console.warn('Parsed lines:', dataLines);
          throw new Error('Format file tidak sesuai atau data valid tidak ditemukan. Pastikan kolom Nama dan WhatsApp terisi.');
        }

        const response = await api.post('/admin/cans/bulk', {
          branch_id: importBranchId,
          items
        }) as unknown as ApiResponse<{ count: number }>;

        if (response.success && response.data) {
          toast.success(`Berhasil mengimpor ${response.data.count} data kaleng`);
          setIsImportModalOpen(false);
          setImportFile(null);
          void fetchData();
        }
      } catch (error) {
        const err = error as ApiError;
        console.error('Import error:', err);
        toast.error(err.message || 'Gagal memproses file impor');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(importFile);
  };

  const handleReactivate = async (id: string) => {
    toast.custom((t: string | number) => (
      <ConfirmToast
        id={t}
        title="Aktifkan Kembali?"
        description="Kaleng ini akan kembali muncul dalam daftar penjemputan aktif."
        confirmLabel="Ya, Aktifkan"
        onConfirm={() => {
          toast.promise(
            api.put(`/admin/cans/${id}`, { is_active: true }).then((res) => {
              void fetchData();
              return res;
            }),
            {
              loading: 'Mengaktifkan...',
              success: 'Data kaleng berhasil diaktifkan kembali',
              error: (err: ApiError) => err.error?.message || err.message || 'Gagal mengaktifkan data',
            }
          )
        }}
        variant="info"
      />
    ), { duration: 3000 });
  };

  const columns: ColumnDef<CanExtended>[] = [
    {
      id: 'selection',
      header: () => {
        const selectableData = data.filter(item => !(item.assignments && item.assignments.length > 0));
        const isAllSelected = selectableData.length > 0 && selectedIds.length === selectableData.length;

        return (
          <button
            onClick={toggleSelectAll}
            disabled={selectableData.length === 0}
            className="p-1 hover:bg-[#1F8243]/30 rounded transition-colors disabled:opacity-30"
          >
            {isAllSelected ? (
              <CheckSquare size={18} className="text-[#1F8243]" />
            ) : (
              <Square size={18} className="text-[#F4F1EA]/30" />
            )}
          </button>
        );
      },
      cell: ({ row }) => {
        const isAssigned = row.original.assignments && row.original.assignments.length > 0;
        return (
          <button
            onClick={() => toggleSelectId(row.original)}
            disabled={isAssigned}
            className={`p-1 rounded transition-colors ${isAssigned ? 'opacity-20 cursor-not-allowed' : 'hover:bg-[#1F8243]/30'}`}
            title={isAssigned ? "Kaleng sedang dalam penugasan" : "Pilih Kaleng"}
          >
            {selectedIds.includes(row.original.id) ? (
              <CheckSquare size={18} className="text-[#1F8243]" />
            ) : (
              <Square size={18} className="text-[#F4F1EA]/30" />
            )}
          </button>
        );
      },
    },
    {
      accessorKey: 'ownerName',
      header: () => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[#EAD19B]" />
          <span>PEMILIK</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-[#F4F1EA]/40 tracking-tight">{row.original.qrCode}</span>
          <span className="font-bold text-[#F4F1EA] tracking-tight mt-0.5">{row.original.ownerName}</span>
          <span className="text-[11px] font-medium text-[#F4F1EA]/50 tracking-tight mt-0.5">
            {row.original.ownerWhatsapp || '-'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'address',
      header: () => (
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="text-[#EAD19B]" />
          <span>ALAMAT</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-[10px] text-[#EAD19B]/60 font-bold uppercase tracking-widest">
            {cleanBranchName(row.original.branch?.name) || 'PUSAT'}
          </span>
          <span className="text-xs font-medium uppercase tracking-tight text-[#F4F1EA]/60 mt-0.5">
            {row.original.dukuhDetails?.name || row.original.dukuh || '-'}
          </span>
          <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest mt-0.5">
            RT {row.original.rt || '-'} / RW {row.original.rw || '-'}
          </span>
        </div>
      ),
    },
    {
      // Kolom ini membaca `condition` (kondisi aset), bukan `isActive` dan bukan
      // status tugas. `isActive` hanya jadi jaring pengaman bila backend lama
      // belum mengirim kolom condition.
      accessorKey: 'condition',
      header: () => (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-[#EAD19B]" />
          <span>STATUS</span>
        </div>
      ),
      cell: ({ row }) => {
        const can = row.original;
        const condition = can.condition ?? (can.isActive ? 'AKTIF' : 'DIKEMBALIKAN');
        const style = CONDITION_STYLE[condition] ?? CONDITION_STYLE.AKTIF;
        return (
          <div className="flex flex-col">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${style.className}`}>
              {style.label}
            </span>
            {style.hint && (
              <span className="text-[11px] italic text-[#F4F1EA]/50 leading-tight mt-0.5">
                {style.hint}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const isNonActiveRow = !row.original.isActive;
        const isAssigned = row.original.assignments && row.original.assignments.length > 0;

        return (
          <div className="flex items-center justify-end gap-2">
            {row.original.qrCode && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-[#1F8243]/10 transition-all duration-300 group"
                onClick={() => handleGenerateQr(row.original)}
                title="Generate QR Code"
              >
                <QrCode size={14} className="text-[#1F8243] group-hover:text-[#EAD19B]" />
              </Button>
            )}
            {isNonActiveRow ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 group"
                onClick={() => handleReactivate(row.original.id)}
                title="Aktifkan Kembali"
              >
                <RotateCcw size={14} className="text-[#EAD19B]" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 group"
                onClick={() => handleEdit(row.original)}
                title="Edit Data"
              >
                <Edit size={14} className="text-[#EAD19B]" />
              </Button>
            )}

            {!isAssigned && (
              <Button
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 rounded-xl transition-all duration-300 border-white/10 bg-white/5 group ${isNonActiveRow ? 'hover:bg-red-500/20 hover:text-[#D97A76] hover:border-red-500/30' : 'hover:bg-red-500/10 hover:text-[#D97A76] hover:border-red-500/20'}`}
                onClick={() => handleDelete(row.original.id, isNonActiveRow)}
                title={isNonActiveRow ? 'Hapus Permanen' : 'Tandai Dikembalikan'}
              >
                {isNonActiveRow ? (
                  <AlertTriangle size={14} className="text-[#D97A76]" />
                ) : (
                  <Trash2 size={14} className="text-[#F4F1EA]/60 group-hover:text-[#D97A76]" />
                )}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section — pola detail users/[id]: tombol Kembali + judul wilayah */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/cans')}
            aria-label="Kembali ke daftar wilayah"
            className="h-9 w-9 shrink-0 p-0 rounded-xl border border-white/10 bg-white/5 text-[#F4F1EA]/70 hover:text-[#F4F1EA] hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
          >
            <ArrowLeft size={16} />
          </button>
          <Box className="text-[#EAD19B]" size={28} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight truncate">
              {regionName ? cleanBranchName(regionName).toUpperCase() : 'Detail Wilayah'}
            </h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium truncate">
              {regionBranchName
                ? cleanBranchName(regionBranchName).toUpperCase()
                : regionKind === 'dukuh' ? 'Data kaleng per dukuh' : 'Manajemen data donatur dan distribusi kaleng Lazisnu'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Bulk Action Pill Wrapper */}
          {selectedIds.length > 0 && (
            isBulkPermanentSelection() ? (
              <button
                onClick={handleBulkDelete}
                className="h-[35px] px-4 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-2 bg-[#D97A76] text-white shadow-lg shadow-[#D97A76]/20"
              >
                <AlertTriangle size={14} strokeWidth={3} />
                Hapus Permanen ({selectedIds.length})
              </button>
            ) : (
              <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
                <div className="bg-[#1F8243]/5 backdrop-blur-sm rounded-xl border border-[#1F8243]/10">
                  <button
                    onClick={handleBulkGenerateQr}
                    className="h-[33px] px-4 rounded-xl text-[11px] font-bold text-[#F4F1EA] hover:bg-[#1F8243]/10 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Printer size={14} strokeWidth={3} />
                    Cetak ({selectedIds.length})
                  </button>
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="h-[33px] px-4 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-2 text-[#D97A76] hover:bg-[#D97A76]/10"
                >
                  <Trash2 size={14} strokeWidth={3} />
                  Hapus ({selectedIds.length})
                </button>
              </div>
            )
          )}

          {/* Primary Action Pill Wrapper */}
          <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm h-[45px] items-center">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="h-[35px] px-4 rounded-xl text-[11px] font-bold text-white/90 hover:bg-white/5 transition-all active:scale-95 flex items-center gap-2"
            >
              <Box size={14} strokeWidth={3} className="text-[#EAD19B]" />
              Impor Data
            </button>
            <button
              onClick={() => {
                setEditingCan(null);
                reset();
                if (user?.role === 'ADMIN_RANTING' && user?.branchId) {
                  setValue('branch_id', user.branchId);
                }
                setIsModalOpen(true);
              }}
              className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2 ml-1"
            >
              <Plus size={14} strokeWidth={3} />
              Tambah Kaleng Baru
            </button>
          </div>
        </div>
      </div>

      {/* Tabel wilayah — halaman detail, wilayah terkunci dari URL. */}
      <div className="flex flex-col gap-4">

      {/* Transparent Toolbar Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-transparent p-4 md:p-5 border-none shadow-none">
        <div className="relative w-full lg:w-80 group">
          {/* Refined Search Pill Design - Standardized Height */}
          <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
            <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
              <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
            </div>
            <input
              type="text"
              placeholder="Cari..."
              className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <DropdownFilter
            label="Pilih Status"
            showSearch={false}
            options={[
              { label: 'SEMUA STATUS', value: 'ALL' },
              // Lima kondisi aset — nilai `value` harus sama dengan yang dibaca
              // `canService.getCans` (AKTIF/RUSAK/HILANG/DIKEMBALIKAN, dan
              // NON_ACTIVE dipetakan ke kondisi NON_AKTIF).
              { label: 'AKTIF', value: 'AKTIF' },
              { label: 'NON-AKTIF', value: 'NON_ACTIVE' },
              { label: 'RUSAK', value: 'RUSAK' },
              { label: 'HILANG', value: 'HILANG' },
              { label: 'DIKEMBALIKAN', value: 'DIKEMBALIKAN' }
            ]}
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            }}
            className="h-[36px]"
          />

          {/* Filter ranting dihapus: layer kartu sudah menyaring otomatis. */}
          <DropdownFilter
            options={[
              { label: '10', value: '10' },
              { label: '20', value: '20' },
              { label: '50', value: '50' },
              { label: '100', value: '100' }
            ]}
            value={pageSize.toString()}
            onChange={(val) => {
              setPageSize(Number(val));
              setCurrentPage(1);
            }}
            className="min-w-[80px]! h-[36px]"
            popoverWidth="w-full"
            showSearch={false}
          />

          <button
            onClick={() => {
              setSearch(FILTER_AWAL.search);
              setStatusFilter(FILTER_AWAL.statusFilter);
              setCurrentPage(FILTER_AWAL.currentPage);
              setPageSize(FILTER_AWAL.pageSize);
            }}
            className="h-[36px] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white/90 hover:bg-[#F4F1EA]/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
          >
            <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Table Container wrapped in Glass Card */}
      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full transition-all duration-700">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <div className="min-w-[800px] w-full">
            <Table columns={columns} data={data} loading={loading} variant="glass" />
          </div>
        </div>

        {/* Smart Pagination Control - Standardized with Audit Log */}
        {!loading && totalItems > 0 && (
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
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Kaleng</span>
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
                  <span className="text-xs font-black text-[#F4F1EA]">{Math.ceil(totalItems / pageSize)}</span>
                </div>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="w-10 h-10 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= Math.ceil(totalItems / pageSize)}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="w-10 h-10 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
      </div>

      {/* Modal Impor */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Impor Data Kaleng (Massal)"
        variant="glass"
      >
        <div className="space-y-5">
          <div className="bg-[#6B9E9F]/10 p-4 rounded-2xl border border-white/10 space-y-2">
            <h4 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <Filter size={16} /> Panduan Format CSV
            </h4>
            <div className="text-[11px] text-[#F4F1EA]/60 space-y-1">
              <p>1. Gunakan file CSV (Comma Separated Values)</p>
              <p>2. Urutan Kolom: <strong>Nama Pemilik, WhatsApp, Nama Dukuh, RT, RW</strong></p>
              <p>3. Contoh Baris: <code className="bg-white/10 px-1 rounded">Budi, 62812345678, Dukuh A, 001, 002</code></p>
              <p>4. Nama Dukuh harus persis dengan yang terdaftar di sistem.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Ranting Tujuan</label>
            <GlassSelect
              value={importBranchId}
              onChange={(val) => setImportBranchId(val)}
              placeholder="-- Pilih Ranting --"
              options={branches.map((b: Branch) => ({
                label: cleanBranchName(b.name).toUpperCase(),
                value: b.id
              }))}
              searchable
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih File CSV</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-white/20 border-dashed rounded-2xl cursor-pointer bg-white/3 hover:bg-white/5 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <RefreshCcw className="w-8 h-8 mb-3 text-[#F4F1EA]/40" />
                  <p className="mb-2 text-sm text-[#F4F1EA]/60">
                    <span className="font-bold">{importFile ? importFile.name : 'Klik untuk unggah'}</span>
                  </p>
                  <p className="text-xs text-[#F4F1EA]/40">File CSV saja (Maks 2MB)</p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1 rounded-xl h-12 font-bold border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
              onClick={() => setIsImportModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl h-12 font-bold"
              onClick={handleImport}
              isLoading={importing}
              disabled={!importBranchId || !importFile}
            >
              Mulai Impor
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Tambah/Edit Kaleng */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCan(null);
        }}
        title={editingCan ? "Edit Data Kaleng" : "Tambah Kaleng Baru"}
        variant="glass"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Nama Lengkap Pemilik</label>
            <Input {...register('owner_name')} placeholder="Contoh: Bpk. Slamet" variant="glass" />
            {errors.owner_name && <p className="text-xs font-medium text-red-400">{errors.owner_name.message}</p>}
          </div>

          {user?.role === 'ADMIN_KECAMATAN' ? (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Ranting (Desa)</label>
              <GlassSelect
                value={watch('branch_id') || ''}
                onChange={(val) => {
                  setValue('branch_id', val);
                  setValue('dukuh_id', '');
                }}
                placeholder="-- Pilih Ranting --"
                options={branches.map((b: Branch) => ({
                  label: cleanBranchName(b.name).toUpperCase(),
                  value: b.id
                }))}
                error={errors.branch_id?.message}
                searchable
              />
            </div>
          ) : (
            <input type="hidden" {...register('branch_id')} />
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Dukuh</label>
            <GlassSelect
              value={watch('dukuh_id') || ''}
              onChange={(val) => setValue('dukuh_id', val)}
              placeholder="-- Pilih Dukuh --"
              options={dukuhs.map((d: Dukuh) => ({
                label: d.name,
                value: d.id
              }))}
              error={errors.dukuh_id?.message}
              disabled={!watch('branch_id')}
              searchable
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#F4F1EA]/60">RT</label>
              <Input
                {...register('rt')}
                placeholder="000"
                maxLength={3}
                variant="glass"
                className="text-center font-mono tracking-widest"
              />
              {errors.rt && <p className="text-xs font-medium text-red-400">{errors.rt.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#F4F1EA]/60">RW</label>
              <Input
                {...register('rw')}
                placeholder="000"
                maxLength={3}
                variant="glass"
                className="text-center font-mono tracking-widest"
              />
              {errors.rw && <p className="text-xs font-medium text-red-400">{errors.rw.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#EAD19B] uppercase tracking-wider">Nomor WhatsApp (Wajib)</label>
            <div className="relative group">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F4F1EA]/40 group-focus-within:text-[#EAD19B] transition-colors" size={16} />
              <input
                {...register('owner_whatsapp')}
                placeholder="Contoh: 628123456789"
                className="w-full h-11 pl-10 pr-3 bg-white/3 border border-white/10 rounded-xl text-sm text-[#F4F1EA] font-medium focus:ring-2 focus:ring-[#EAD19B]/30 outline-none transition-all placeholder:text-[#F4F1EA]/30"
              />
            </div>
            {errors.owner_whatsapp && <p className="text-xs font-medium text-red-400">{errors.owner_whatsapp.message}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 rounded-xl h-12 font-bold border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
              onClick={() => {
                setIsModalOpen(false);
                setEditingCan(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl h-12 font-bold shadow-lg shadow-[#EAD19B]/20"
            >
              {editingCan ? 'Simpan Perubahan' : 'Simpan Kaleng'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Cetak QR */}
      <Modal
        isOpen={isQrModalOpen}
        onClose={() => !isGeneratingQr && setIsQrModalOpen(false)}
        title={isBulkPrint ? "Cetak Label QR (Massal)" : "Cetak Label QR"}
        variant="glass"
      >
        <div className="flex flex-col items-center justify-center p-4 space-y-6">
          {isGeneratingQr ? (
            <div className="flex flex-col items-center space-y-4 py-8">
              <div className="w-12 h-12 border-4 border-[#EAD19B]/20 border-t-[#EAD19B] rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-[#F4F1EA]/60">
                {isBulkPrint ? "Sedang merangkai PDF A4..." : "Sedang memproses QR Code..."}
              </p>
            </div>
          ) : qrData ? (
            <>
              {(() => {
                // Satu sumber daftar preview: bulk pakai previews[], single dibungkus array 1 item
                const items: QrPreviewItem[] = isBulkPrint
                  ? (qrData.previews || [])
                  : (qrData.qrImageUrl
                      ? [{ qrCode: qrData.qrCode || '', qrImageUrl: qrData.qrImageUrl }]
                      : []);
                const total = items.length;
                const idx = Math.min(qrIndex, Math.max(total - 1, 0));
                const current = items[idx];
                return (
                  <div className="flex flex-col items-center w-full space-y-4">
                    {total > 0 && current ? (
                      <>
                        <div className="flex items-center justify-center gap-4 w-full">
                          <button
                            onClick={() => setQrIndex(i => Math.max(i - 1, 0))}
                            disabled={idx === 0}
                            className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center"
                            title="Sebelumnya"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <div className="bg-white p-4 rounded-2xl shadow-sm border border-white/10 flex flex-col items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={current.qrImageUrl} alt="QR Code" className="w-40 h-40 object-contain" />
                            <p className="text-xs font-bold text-[#2C473E]/70 uppercase tracking-widest">{current.qrCode}</p>
                            {current.ownerName && (
                              <p className="text-[11px] font-semibold text-[#2C473E]/50">{current.ownerName}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setQrIndex(i => Math.min(i + 1, total - 1))}
                            disabled={idx >= total - 1}
                            className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center"
                            title="Berikutnya"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                        <p className="text-xs font-bold text-[#F4F1EA]/40 uppercase tracking-widest">
                          {idx + 1} / {total}
                        </p>
                      </>
                    ) : (
                      <div className="bg-[#1F8243]/10 p-6 rounded-2xl border border-[#1F8243]/20 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center shadow-sm mb-4">
                          <Printer size={28} className="text-[#1F8243]" />
                        </div>
                        <h4 className="text-lg font-bold text-[#F4F1EA] mb-1">Berhasil Dirangkai!</h4>
                        <p className="text-sm text-[#F4F1EA]/60">PDF berisi {qrData.count} label QR Code siap diunduh.</p>
                      </div>
                    )}
                    <div className="w-full flex gap-3 pt-2">
                      <Button variant="secondary" className="flex-1 rounded-xl h-12 font-bold border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]" onClick={() => setIsQrModalOpen(false)}>Selesai</Button>
                      <Button
                        className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl h-12 font-bold shadow-lg shadow-[#EAD19B]/20 flex items-center gap-2 justify-center"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = qrData.printUrl;
                          a.download = isBulkPrint ? 'lazisnu-qr-batch.pdf' : `lazisnu-qr-${qrData.qrCode}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                      >
                        <Printer size={18} />
                        Unduh {isBulkPrint ? 'PDF Label' : 'Label QR'}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="text-red-400">Gagal memuat data QR</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
