'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ConfirmToast } from '@/components/ui/ConfirmToast';
import { 
  Users, 
  User,
  Plus, 
  Search, 
  UserPlus, 
  Edit, 
  MoreVertical,
  Phone,
  Mail,
  Shield,
  Map,
  UserCheck,
  UserMinus,
  Filter,
  RotateCcw,
  CheckSquare,
  Square,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/store/useAuthStore';
import { FilterPills } from '@/components/ui/FilterPills';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { cn } from '@/lib/utils';

const officerSchema = z.object({
  full_name: z.string().min(1, 'Nama lengkap wajib diisi'),
  phone: z.string().min(10, 'Nomor HP minimal 10 digit'),
  branch_id: z.string().min(1, 'Pilih ranting').optional(),
});

type OfficerFormValues = z.infer<typeof officerSchema>;

export default function UsersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { user } = useAuthStore();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<OfficerFormValues>({
    resolver: zodResolver(officerSchema as any),
  });

  const fetchBranches = async () => {
    try {
      const response: any = await api.get('/admin/branches');
      if (response.success) setBranches(response.data);
    } catch (err) {}
  };

  const fetchOfficers = async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/officers', { 
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
        setSelectedIds([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch officers:', error.response?.data || error.message || error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOfficers();
  }, [search, branchFilter, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    if (user?.role === 'ADMIN_KECAMATAN') void fetchBranches();
  }, [user]);

  const onSubmit = async (values: OfficerFormValues) => {
    setSubmitting(true);
    try {
      if (editingOfficer) {
        const response: any = await api.put(`/admin/officers/${editingOfficer.id}`, values);
        if (response.success) {
          setIsModalOpen(false);
          setEditingOfficer(null);
          reset();
          void fetchOfficers();
          toast.success('Data petugas berhasil diperbarui', { duration: 3000 });
        }
      } else {
        const response: any = await api.post('/admin/officers', values);
        if (response && response.success) {
          reset();
          setIsModalOpen(false);
          void fetchOfficers();
          toast.success('Petugas berhasil ditambahkan', { duration: 3000 });
        }
      }
    } catch (error: any) {
      console.error('Submit Error:', error);
      const errorMessage = error?.error?.message || error?.message || 'Gagal menyimpan data';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (officer: any) => {
    setEditingOfficer(officer);
    setValue('full_name', officer.full_name);
    setValue('phone', officer.phone);
    setValue('branch_id', officer.branch_id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, isPermanentRow?: boolean) => {
    const isPermanent = isPermanentRow || statusFilter === 'NON_ACTIVE';
    const message = isPermanent 
      ? 'Hapus PERMANEN petugas ini? Data terkait akan hilang.'
      : 'Nonaktifkan petugas ini?';
      
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={isPermanent ? "Hapus Permanen?" : "Nonaktifkan Petugas?"}
        description={isPermanent 
          ? "Data petugas akan dihapus selamanya dari sistem." 
          : "Petugas tidak akan bisa mengakses sistem sementara."}
        confirmLabel={isPermanent ? "Hapus Permanen" : "Ya, Nonaktifkan"}
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/officers/${id}${isPermanent ? '?permanent=true' : ''}`).then((res) => {
              void fetchOfficers();
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isPermanent ? 'Petugas berhasil dihapus permanen' : 'Petugas berhasil dinonaktifkan',
              error: (err: any) => err.error?.message || err.message || 'Gagal memproses penghapusan',
            }
          );
        }}
        variant={isPermanent ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const isNonActiveView = statusFilter === 'NON_ACTIVE';
    const message = isNonActiveView
      ? `Hapus PERMANEN ${selectedIds.length} petugas?`
      : `Nonaktifkan ${selectedIds.length} petugas?`;
      
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={isNonActiveView ? "Hapus Massal?" : "Nonaktifkan Massal?"}
        description={isNonActiveView 
          ? `Hapus permanen ${selectedIds.length} petugas terpilih?` 
          : `Nonaktifkan ${selectedIds.length} petugas terpilih?`}
        confirmLabel={isNonActiveView ? "Hapus Permanen" : "Ya, Nonaktifkan"}
        onConfirm={() => {
          toast.promise(
            api.post('/admin/officers/bulk-delete', {
              ids: selectedIds,
              permanent: isNonActiveView
            }).then((res) => {
              void fetchOfficers();
              return res;
            }),
            {
              loading: 'Memproses...',
              success: isNonActiveView
                ? `Berhasil menghapus permanen ${selectedIds.length} petugas`
                : `Berhasil menonaktifkan ${selectedIds.length} petugas`,
              error: (err: any) => err.message || 'Gagal menghapus data masal',
            }
          );
        }}
        variant={isNonActiveView ? 'danger' : 'warning'}
      />
    ), { duration: 5000 });
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(item => item.id));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleReactivate = async (id: string) => {
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title="Aktifkan Kembali?"
        description="Petugas ini akan kembali mendapatkan akses penuh ke dalam sistem."
        confirmLabel="Ya, Aktifkan"
        onConfirm={() => {
          toast.promise(
            api.put(`/admin/officers/${id}`, { is_active: true }).then((res) => {
              void fetchOfficers();
              return res;
            }),
            {
              loading: 'Mengaktifkan...',
              success: 'Petugas berhasil diaktifkan kembali',
              error: (err: any) => err.error?.message || err.message || 'Gagal mengaktifkan petugas',
            }
          );
        }}
        variant="info"
      />
    ), { duration: 5000 });
  };

  const columns: ColumnDef<any>[] = [
    {
      id: 'selection',
      header: () => (
        <button 
          onClick={toggleSelectAll}
          className="p-1 hover:bg-[#1F8243]/30 rounded transition-colors disabled:opacity-30"
        >
          {selectedIds.length === data.length && data.length > 0 ? (
            <CheckSquare size={18} className="text-[#1F8243]" />
          ) : (
            <Square size={18} className="text-[#F4F1EA]/30" />
          )}
        </button>
      ),
      cell: ({ row }) => (
        <button 
          onClick={() => toggleSelectId(row.original.id)}
          className="p-1 hover:bg-[#1F8243]/30 rounded transition-colors"
        >
          {selectedIds.includes(row.original.id) ? (
            <CheckSquare size={18} className="text-[#1F8243]" />
          ) : (
            <Square size={18} className="text-[#F4F1EA]/30" />
          )}
        </button>
      ),
    },
    {
      accessorKey: 'full_name',
      header: () => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[#EAD19B]" />
          <span>Nama Lengkap</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-bold text-[#F4F1EA]">{row.original.full_name}</p>
          <p className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest">{row.original.employee_code}</p>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Phone size={12} className="text-[#EAD19B]" />
          <span>Kontak</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-[12px] font-bold text-[#F4F1EA]/40 tracking-tight">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'branch',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Map size={12} className="text-[#EAD19B]" />
          <span>Asal Ranting</span>
        </div>
      ),
      cell: ({ row }) => {
        const branchName = row.original.branch?.name || 'Belum diatur';
        return (
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#EAD19B]/60">
              {branchName.replace(/ranting/gi, '').trim()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: () => (
        <div className="flex items-center gap-1.5">
          <UserCheck size={12} className="text-[#EAD19B]" />
          <span>Status</span>
        </div>
      ),
      cell: ({ row }) => (
        row.original.is_active ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#1F8243]">AKTIF</span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">NON-AKTIF</span>
        )
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const isNonActiveRow = !row.original.is_active;
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
                <UserMinus size={14} className="text-[#F4F1EA]/60 group-hover:text-[#D97A76]" />
              )}
            </Button>
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
          <Users className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Manajemen User</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Kelola data petugas lapangan dan admin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Bulk Action Buttons */}
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

          {/* Primary Action Button */}
          <Button 
            onClick={() => {
              setEditingOfficer(null);
              reset();
              setIsModalOpen(true);
            }}
            className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <UserPlus size={14} strokeWidth={3} />
            Tambah Petugas Baru
          </Button>
        </div>
      </div>

      {/* Transparent Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-transparent p-5 border-none shadow-none">
        <div className="relative w-[160px] group">
          <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
            <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
              <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
            </div>
            <input
              type="text"
              placeholder="Cari..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <FilterPills 
            options={[
              { label: 'SEMUA', value: 'ALL' },
              { label: 'AKTIF', value: 'ACTIVE' },
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
                  label: b.name.replace(/ranting/gi, '').trim().toUpperCase(),
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

      {/* Table & Pagination Container wrapped in Glass Card */}
      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full transition-all duration-700">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <Table columns={columns} data={data} loading={loading} variant="glass" />
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
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Petugas</span>
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
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= Math.ceil(totalItems / pageSize)}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Tambah/Edit Petugas */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingOfficer(null);
          reset();
        }}
        title={editingOfficer ? "Edit Data Petugas" : "Tambah Petugas Baru"}
        variant="glass"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nama Lengkap"
            placeholder="Masukkan nama lengkap petugas"
            error={errors.full_name?.message}
            variant="glass"
            {...register('full_name')}
          />
          <Input
            label="Nomor Handphone"
            placeholder="0812..."
            error={errors.phone?.message}
            variant="glass"
            {...register('phone')}
          />

          {user?.role === 'ADMIN_KECAMATAN' && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Ranting</label>
              <GlassSelect
                value={watch('branch_id') || ''}
                onChange={(val) => setValue('branch_id', val)}
                placeholder="-- Pilih Ranting --"
                options={branches.map((b: any) => ({
                  label: b.name,
                  value: b.id
                }))}
                error={errors.branch_id?.message}
                searchable
              />
            </div>
          )}
          <div className="text-xs text-[#F4F1EA]/60 bg-white/[0.03] p-4 rounded-xl border border-white/10">
             <div className="flex gap-2 items-center mb-1 font-bold text-[#F4F1EA]">
               <Shield size={14} className="text-[#EAD19B]" />
               <span>Informasi Akses</span>
             </div>
             Email login akan diproduksi otomatis menggunakan nomor HP. Password awal akan dikosongkan (login via OTP WhatsApp).
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
              onClick={() => {
                setIsModalOpen(false);
                setEditingOfficer(null);
                reset();
              }}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
              isLoading={submitting}
            >
              {editingOfficer ? 'Simpan Perubahan' : 'Simpan Petugas'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
