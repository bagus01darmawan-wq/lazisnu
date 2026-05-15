'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cleanBranchName } from '@/lib/formatters';
import { cn } from '@/lib/utils';
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
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FilterPills } from '@/components/ui/FilterPills';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { Card } from '@/components/ui/Card';

const canSchema = z.object({
  owner_name: z.string().min(1, 'Nama pemilik wajib diisi'),
  branch_id: z.string().uuid('Pilih ranting'),
  dukuh_id: z.string().uuid('Pilih dukuh'),
  rt: z.string().min(1, 'Pilih RT'),
  rw: z.string().min(1, 'Pilih RW'),
  owner_whatsapp: z.string().min(10, 'Nomor WhatsApp minimal 10 digit'),
});

type CanFormValues = z.infer<typeof canSchema>;

export default function CansPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCan, setEditingCan] = useState<any>(null);
  const [branches, setBranches] = useState([]);
  const [dukuhs, setDukuhs] = useState([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination & Filter states
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importBranchId, setImportBranchId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  // QR Print States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<any>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isBulkPrint, setIsBulkPrint] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CanFormValues>({
    resolver: zodResolver(canSchema as any),
  });

  const selectedBranchId = watch('branch_id');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/cans', {
        params: {
          search,
          branch_id: branchFilter,
          status: statusFilter,
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.success) {
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
      const response: any = await api.get('/admin/branches');
      if (response.success) {
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
      const response: any = await api.get('/admin/dukuhs', { params: { branch_id: branchId } });
      if (response.success) {
        setDukuhs(response.data || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch dukuhs:', error.response?.data || error.message || error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, branchFilter, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchDukuhs(selectedBranchId);
  }, [selectedBranchId]);

  const onSubmit = async (values: any) => {
    try {
      const payload = {
        owner_name: values.owner_name,
        owner_whatsapp: values.owner_whatsapp,
        branch_id: values.branch_id,
        dukuh_id: values.dukuh_id,
        rt: values.rt,
        rw: values.rw,
        owner_address: values.owner_address || '',
      };

      if (editingCan) {
        const response: any = await api.put(`/admin/cans/${editingCan.id}`, payload);
        if (response.success) {
          setIsModalOpen(false);
          setEditingCan(null);
          await fetchData();
          toast.success('Data kaleng berhasil diperbarui');
        }
      } else {
        const response: any = await api.post('/admin/cans', payload);
        if (response.success) {
          setIsModalOpen(false);
          reset();
          await fetchData();
          toast.success('Kaleng baru berhasil ditambahkan');
        }
      }
    } catch (error: any) {
      toast.error(error.error?.message || error.message || 'Gagal menyimpan data');
    }
  };

  const handleEdit = (can: any) => {
    setEditingCan(can);
    setValue('owner_name', can.owner_name);
    setValue('branch_id', can.branch_id);
    setValue('dukuh_id', can.dukuh_id);
    setValue('rt', can.rt || '');
    setValue('rw', can.rw || '');
    setValue('owner_whatsapp', can.owner_whatsapp || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, isPermanentRow?: boolean) => {
    const isPermanent = isPermanentRow || statusFilter === 'NON_ACTIVE';
    const message = isPermanent
      ? 'Hapus PERMANEN kaleng ini? Data akan hilang selamanya.'
      : 'Nonaktifkan kaleng ini?';

    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={isPermanent ? "Hapus Permanen?" : "Nonaktifkan Kaleng?"}
        description={isPermanent
          ? "Data akan hilang selamanya dan tidak dapat dikembalikan."
          : "Kaleng tidak akan muncul di daftar penjemputan aktif."}
        confirmLabel={isPermanent ? "Hapus Permanen" : "Ya, Nonaktifkan"}
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/cans/${id}${isPermanent ? '?permanent=true' : ''}`).then((res) => {
              fetchData();
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isPermanent ? 'Data kaleng berhasil dihapus permanen' : 'Data kaleng berhasil dinonaktifkan',
              error: (err: any) => err.error?.message || err.message || 'Gagal memproses penghapusan',
            }
          )
        }}
        variant={isPermanent ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const isNonActiveView = statusFilter === 'NON_ACTIVE';

    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={isNonActiveView ? "Hapus Massal?" : "Nonaktifkan Massal?"}
        description={isNonActiveView
          ? `Hapus permanen ${selectedIds.length} kaleng terpilih?`
          : `Nonaktifkan ${selectedIds.length} kaleng terpilih?`}
        confirmLabel={isNonActiveView ? "Hapus Permanen" : "Ya, Nonaktifkan"}
        onConfirm={() => {
          toast.promise(
            api.post('/admin/cans/bulk-delete', {
              ids: selectedIds,
              permanent: isNonActiveView
            }).then((res) => {
              fetchData();
              setSelectedIds([]);
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isNonActiveView
                ? `Berhasil menghapus permanen ${selectedIds.length} kaleng`
                : `Berhasil menonaktifkan ${selectedIds.length} kaleng`,
              error: (err: any) => err.message || 'Gagal menghapus data masal',
            }
          )
        }}
        variant={isNonActiveView ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const handleGenerateQr = async (id: string) => {
    setIsGeneratingQr(true);
    setIsQrModalOpen(true);
    setIsBulkPrint(false);
    setQrData(null);
    try {
      const response: any = await api.post(`/admin/cans/${id}/generate-qr`);
      if (response.success) {
        setQrData(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Gagal membuat QR Code');
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
    try {
      const response: any = await api.post(`/admin/cans/bulk-generate-qr`, { ids: selectedIds });
      if (response.success) {
        setQrData(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Gagal membuat QR Code masal');
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

  const toggleSelectId = (item: any) => {
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
        const dukuhsRes: any = await api.get('/admin/dukuhs', { params: { branch_id: importBranchId } });
        const branchDukuhs = dukuhsRes.data || [];

        const items = dataLines.map(line => {
          // Detect separator automatically (comma or semicolon)
          const separator = line.includes(';') ? ';' : ',';
          const columns = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));

          const ownerName = columns[0];
          const ownerWhatsapp = columns[1];
          const dukuhName = columns[2];
          const rt = columns[3] || '';
          const rw = columns[4] || '';

          // Find dukuh ID by name
          const dukuh = branchDukuhs.find((d: any) => d.name.toUpperCase() === dukuhName?.toUpperCase());

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

        const response: any = await api.post('/admin/cans/bulk', {
          branch_id: importBranchId,
          items
        });

        if (response.success) {
          toast.success(`Berhasil mengimpor ${response.data.count} data kaleng`);
          setIsImportModalOpen(false);
          setImportFile(null);
          fetchData();
        }
      } catch (error: any) {
        console.error('Import error:', error);
        toast.error(error.message || 'Gagal memproses file impor');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(importFile);
  };

  const handleReactivate = async (id: string) => {
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title="Aktifkan Kembali?"
        description="Kaleng ini akan kembali muncul dalam daftar penjemputan aktif."
        confirmLabel="Ya, Aktifkan"
        onConfirm={() => {
          toast.promise(
            api.put(`/admin/cans/${id}`, { is_active: true }).then((res) => {
              fetchData();
              return res;
            }),
            {
              loading: 'Mengaktifkan...',
              success: 'Data kaleng berhasil diaktifkan kembali',
              error: (err: any) => err.error?.message || err.message || 'Gagal mengaktifkan data',
            }
          )
        }}
        variant="info"
      />
    ), { duration: 3000 });
  };

  const columns: ColumnDef<any>[] = [
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
      accessorKey: 'qr_code',
      header: () => (
        <div className="flex items-center gap-1.5">
          <QrCode size={12} className="text-[#EAD19B]" />
          <span>Kode Kaleng</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-[12px] font-bold text-[#F4F1EA]/40 tracking-tight">{row.original.qr_code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'owner_name',
      header: () => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[#EAD19B]" />
          <span>PEMILIK</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA] tracking-tight">{row.original.owner_name}</span>
          <span className="text-[10px] text-[#EAD19B]/60 font-bold uppercase tracking-widest mt-0.5">
            {cleanBranchName(row.original.branch?.name) || 'PUSAT'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'address',
      header: () => (
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="text-[#EAD19B]" />
          <span>DUSUN</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-tight text-[#F4F1EA]/60">
            {row.original.dukuh_details?.name || row.original.dukuh || '-'}
          </span>
          <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest mt-0.5">
            RT {row.original.rt || '-'} / RW {row.original.rw || '-'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'owner_whatsapp',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Phone size={12} className="text-[#EAD19B]" />
          <span>WHATSAPP</span>
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-[12px] font-bold text-[#F4F1EA]/40 tracking-tight">
          {row.original.owner_whatsapp}
        </span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: () => (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-[#EAD19B]" />
          <span>STATUS</span>
        </div>
      ),
      cell: ({ row }) => {
        const can = row.original;
        const isAssigned = can.assignments && can.assignments.length > 0;

        if (!can.is_active) {
          return <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">NON-AKTIF</span>;
        }

        if (isAssigned) {
          return (
            <span
              className="text-[10px] font-bold uppercase tracking-widest text-[#DE6F4A] cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/dashboard/assignments')}
            >
              ASSIGNED
            </span>
          );
        }

        return <span className="text-[10px] font-bold uppercase tracking-widest text-[#1F8243]">AKTIF</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const isNonActiveRow = !row.original.is_active;
        const isAssigned = row.original.assignments && row.original.assignments.length > 0;

        return (
          <div className="flex items-center justify-end gap-2">
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
                title={isNonActiveRow ? 'Hapus Permanen' : 'Non-aktifkan'}
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
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Box className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Kelola Kaleng Infaq</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Manajemen data donatur dan distribusi kaleng Lazisnu</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Bulk Action Pill Wrapper */}
          {selectedIds.length > 0 && (
            statusFilter === 'NON_ACTIVE' ? (
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

      {/* Transparent Toolbar Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-transparent p-5 border-none shadow-none">
        <div className="relative w-[160px] group">
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
          <FilterPills
            options={[
              { label: 'SEMUA', value: 'ALL' },
              { label: 'AKTIF', value: 'ACTIVE' },
              { label: 'ASSIGNED', value: 'ASSIGNED' },
              { label: 'NON-AKTIF', value: 'NON_ACTIVE' }
            ]}
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            }}
            className="h-[36px] p-1"
          />

          {user?.role === 'ADMIN_KECAMATAN' && (
            <DropdownFilter
              label="Pilih Ranting"
              placeholder="Cari ranting..."
              options={[
                { label: 'SEMUA RANTING', value: '' },
                ...branches.map((b: any) => ({
                  label: cleanBranchName(b.name).toUpperCase(),
                  value: b.id
                }))
              ]}
              value={branchFilter}
              onChange={(val) => {
                setBranchFilter(val);
                setCurrentPage(1);
              }}
              className="h-[36px]"
            />
          )}

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
              setSearch('');
              setBranchFilter('');
              setStatusFilter('ACTIVE');
              setCurrentPage(1);
              setPageSize(10);
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
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= Math.ceil(totalItems / pageSize)}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

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
              options={branches.map((b: any) => ({
                label: cleanBranchName(b.name).toUpperCase(),
                value: b.id
              }))}
              searchable
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih File CSV</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-white/20 border-dashed rounded-2xl cursor-pointer bg-white/[0.03] hover:bg-white/5 transition-all">
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

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Ranting (Desa)</label>
            <GlassSelect
              value={watch('branch_id') || ''}
              onChange={(val) => {
                setValue('branch_id', val);
                setValue('dukuh_id', '');
              }}
              placeholder="-- Pilih Ranting --"
              options={branches.map((b: any) => ({
                label: cleanBranchName(b.name).toUpperCase(),
                value: b.id
              }))}
              error={errors.branch_id?.message}
              searchable
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Dukuh</label>
            <GlassSelect
              value={watch('dukuh_id') || ''}
              onChange={(val) => setValue('dukuh_id', val)}
              placeholder="-- Pilih Dukuh --"
              options={dukuhs.map((d: any) => ({
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
                className="w-full h-11 pl-10 pr-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-[#F4F1EA] font-medium focus:ring-2 focus:ring-[#EAD19B]/30 outline-none transition-all placeholder:text-[#F4F1EA]/30"
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
              {!isBulkPrint && qrData.qr_image_url && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-white/10 flex flex-col items-center gap-2">
                  <img src={qrData.qr_image_url} alt="QR Code" className="w-40 h-40 object-contain" />
                  <p className="text-xs font-bold text-[#F4F1EA]/40 uppercase tracking-widest">{qrData.qr_code}</p>
                </div>
              )}
              {isBulkPrint && (
                <div className="bg-[#1F8243]/10 p-6 rounded-2xl border border-[#1F8243]/20 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center shadow-sm mb-4">
                    <Printer size={28} className="text-[#1F8243]" />
                  </div>
                  <h4 className="text-lg font-bold text-[#F4F1EA] mb-1">Berhasil Dirangkai!</h4>
                  <p className="text-sm text-[#F4F1EA]/60">PDF berisi {qrData.count} label QR Code siap diunduh.</p>
                </div>
              )}
              <div className="w-full flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1 rounded-xl h-12 font-bold border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]" onClick={() => setIsQrModalOpen(false)}>Tutup</Button>
                <Button
                  className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl h-12 font-bold shadow-lg shadow-[#EAD19B]/20 flex items-center gap-2 justify-center"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = qrData.print_url;
                    a.download = isBulkPrint ? 'lazisnu-qr-batch.pdf' : `lazisnu-qr-${qrData.qr_code}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  <Printer size={18} />
                  Unduh {isBulkPrint ? 'PDF Label' : 'Label QR'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-red-400">Gagal memuat data QR</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
