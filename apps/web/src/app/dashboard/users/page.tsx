'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Users, 
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
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { user } = useAuthStore();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<OfficerFormValues>({
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
      
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[250px]">
        <div className="flex items-center gap-2">
          {isPermanent ? <AlertTriangle size={18} className="text-red-600" /> : <UserMinus size={18} className="text-slate-400" />}
          <p className="text-sm font-bold text-slate-800">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs font-bold rounded-lg"
            onClick={() => toast.dismiss(t.id)}
          >
            Batal
          </Button>
          <Button 
            size="sm" 
            className={`h-8 text-xs font-bold rounded-lg text-white shadow-sm transition-all active:scale-95 ${isPermanent ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-slate-800 hover:bg-slate-900 shadow-slate-200'}`}
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const response: any = await api.delete(`/admin/officers/${id}${isPermanent ? '?permanent=true' : ''}`);
                if (response.success) {
                  void fetchOfficers();
                  toast.success(isPermanent ? 'Petugas berhasil dihapus permanen' : 'Petugas berhasil dinonaktifkan');
                }
              } catch (error: any) {
                toast.error(error.error?.message || error.message || 'Gagal memproses permintaan');
              }
            }}
          >
            {isPermanent ? 'Hapus Permanen' : 'Ya, Nonaktifkan'}
          </Button>
        </div>
      </div>
    ), { duration: 5000 });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const isNonActiveView = statusFilter === 'NON_ACTIVE';
    const message = isNonActiveView
      ? `Hapus PERMANEN ${selectedIds.length} petugas?`
      : `Nonaktifkan ${selectedIds.length} petugas?`;
      
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} />
          <p className="text-sm font-bold">{message}</p>
        </div>
        <p className="text-[11px] text-slate-500 font-medium px-1">
          {isNonActiveView ? 'Data yang sudah dihapus tidak dapat dikembalikan.' : 'Petugas tidak akan bisa mengakses sistem sementara.'}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs font-bold rounded-lg"
            onClick={() => toast.dismiss(t.id)}
          >
            Batal
          </Button>
          <Button 
            size="sm" 
            className={`h-8 text-xs font-bold rounded-lg text-white shadow-sm transition-all active:scale-95 ${isNonActiveView ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-slate-800 hover:bg-slate-900 shadow-slate-200'}`}
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const response: any = await api.post('/admin/officers/bulk-delete', {
                  ids: selectedIds,
                  permanent: isNonActiveView
                });
                if (response.success) {
                  toast.success(isNonActiveView
                    ? `Berhasil menghapus permanen ${selectedIds.length} petugas`
                    : `Berhasil menonaktifkan ${selectedIds.length} petugas`);
                  void fetchOfficers();
                }
              } catch (error: any) {
                toast.error(error.message || 'Gagal menghapus data masal');
              }
            }}
          >
            {isNonActiveView ? 'Ya, Hapus Permanen' : 'Ya, Nonaktifkan'}
          </Button>
        </div>
      </div>
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
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[250px]">
        <div className="flex items-center gap-2">
          <RotateCcw size={18} className="text-blue-600" />
          <p className="text-sm font-bold text-slate-800">Aktifkan kembali petugas ini?</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs font-bold rounded-lg"
            onClick={() => toast.dismiss(t.id)}
          >
            Batal
          </Button>
          <Button 
            size="sm" 
            className="bg-blue-600 hover:bg-blue-700 h-8 text-xs font-bold rounded-lg text-white shadow-sm transition-all active:scale-95"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const response: any = await api.put(`/admin/officers/${id}`, { is_active: true });
                if (response.success) {
                  void fetchOfficers();
                  toast.success('Petugas berhasil diaktifkan kembali');
                }
              } catch (error: any) {
                toast.error(error.error?.message || error.message || 'Gagal mengaktifkan petugas');
              }
            }}
          >
            Ya, Aktifkan
          </Button>
        </div>
      </div>
    ), { duration: 3000 });
  };

  const columns: ColumnDef<any>[] = [
    {
      id: 'selection',
      header: () => (
        <button 
          onClick={toggleSelectAll}
          className="p-1 hover:bg-slate-200 rounded transition-colors"
        >
          {selectedIds.length === data.length && data.length > 0 ? (
            <CheckSquare size={18} className="text-green-600" />
          ) : (
            <Square size={18} className="text-slate-400" />
          )}
        </button>
      ),
      cell: ({ row }) => (
        <button 
          onClick={() => toggleSelectId(row.original.id)}
          className="p-1 hover:bg-slate-100 rounded transition-colors"
        >
          {selectedIds.includes(row.original.id) ? (
            <CheckSquare size={18} className="text-green-600" />
          ) : (
            <Square size={18} className="text-slate-300" />
          )}
        </button>
      ),
    },
    {
      accessorKey: 'full_name',
      header: 'Nama Lengkap',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold border-2 border-white shadow-sm">
            {row.original.full_name?.charAt(0) || 'U'}
          </div>
          <div className="space-y-0.5">
            <p className="font-bold text-slate-900">{row.original.full_name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{row.original.employee_code}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Kontak',
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
             <Phone size={12} className="text-slate-400" />
             <span>{row.original.phone}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'branch',
      header: 'Asal Ranting',
      cell: ({ row }) => {
        const branchName = row.original.branch?.name || 'Belum diatur';
        return (
          <div className="flex items-center gap-1.5 text-slate-600 italic">
            <Map size={14} className="text-slate-400" />
            <span className="text-sm font-semibold">{branchName.replace(/ranting/gi, '').trim()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'failed'}>
          {row.original.is_active ? 'Aktif' : 'Non-aktif'}
        </Badge>
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
                className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all border-slate-200 group"
                onClick={() => handleReactivate(row.original.id)}
                title="Aktifkan Kembali"
              >
                <RotateCcw size={14} className="text-slate-500 group-hover:text-blue-600" />
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200 group"
                onClick={() => handleEdit(row.original)}
                title="Edit Data"
              >
                <Edit size={14} className="text-slate-500 group-hover:text-green-600" />
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-8 w-8 p-0 rounded-lg transition-all border-slate-200 group ${isNonActiveRow ? 'hover:bg-red-600 hover:text-white hover:border-red-600' : 'hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}
              onClick={() => handleDelete(row.original.id, isNonActiveRow)}
              title={isNonActiveRow ? 'Hapus Permanen' : 'Non-aktifkan'}
            >
              {isNonActiveRow ? (
                <AlertTriangle size={14} className="text-red-500 group-hover:text-white" />
              ) : (
                <UserMinus size={14} className="text-slate-500 group-hover:text-red-600" />
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
          <Users className="text-green-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen User</h1>
            <p className="text-slate-500 text-sm font-medium">Kelola data petugas lapangan dan admin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <Button
              onClick={handleBulkDelete}
              className={`${statusFilter === 'NON_ACTIVE' ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-200' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'} h-11 rounded-xl font-bold px-5 flex items-center gap-2 shadow-lg transition-all active:scale-95`}
            >
              {statusFilter === 'NON_ACTIVE' ? <AlertTriangle size={18} /> : <Trash2 size={18} />}
              {statusFilter === 'NON_ACTIVE' ? 'Hapus Permanen' : 'Hapus Terpilih'} ({selectedIds.length})
            </Button>
          )}
          <Button 
            onClick={() => {
              setEditingOfficer(null);
              reset();
              setIsModalOpen(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 px-6 h-11 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
          >
            <UserPlus size={20} />
            Tambah Petugas
          </Button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-500 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Cari nama atau email petugas..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 focus:bg-white transition-all shadow-sm group-hover:border-slate-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
            <Filter className="text-slate-400 ml-2" size={16} />
            <select 
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="ACTIVE">AKTIF</option>
              <option value="NON_ACTIVE">NON-AKTIF</option>
              <option value="ALL">SEMUA STATUS</option>
            </select>
          </div>

          {user?.role === 'ADMIN_KECAMATAN' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
              <Filter className="text-slate-400 ml-2" size={16} />
              <select 
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="">SEMUA RANTING</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name.replace(/ranting/gi, '').trim().toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500 border-slate-200 hover:bg-slate-50 flex items-center gap-2 transition-all active:scale-95"
            onClick={() => {
              setSearch('');
              setBranchFilter('');
              setStatusFilter('ACTIVE');
              setCurrentPage(1);
            }}
          >
            <RotateCcw size={14} />
            RESET
          </Button>
        </div>
      </div>

      {/* Table & Pagination Container */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <Table columns={columns} data={data} loading={loading} />
        
        {/* Pagination Controls */}
        {!loading && totalItems > 0 && (
          <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
            <p className="text-xs font-medium text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{data.length}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> petugas
            </p>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
                <select 
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                  Halaman <span className="text-green-600">{currentPage}</span> dari {Math.ceil(totalItems / pageSize)}
                </span>
                
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= Math.ceil(totalItems / pageSize)}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                  >
                    Selanjutnya
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah/Edit Petugas */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingOfficer(null);
          reset();
        }}
        title={editingOfficer ? "Edit Data Petugas" : "Tambah Petugas Baru"}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input 
            label="Nama Lengkap" 
            placeholder="Masukkan nama lengkap petugas"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <Input 
            label="Nomor Handphone" 
            placeholder="0812..."
            error={errors.phone?.message}
            {...register('phone')}
          />

          {user?.role === 'ADMIN_KECAMATAN' && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Pilih Ranting</label>
              <select 
                {...register('branch_id')}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
              >
                <option value="">-- Pilih Ranting --</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branch_id && <p className="text-xs font-medium text-red-500">{errors.branch_id.message}</p>}
            </div>
          )}
          <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100">
             <div className="flex gap-2 items-center mb-1 font-bold text-slate-700">
               <Shield size={14} />
               <span>Informasi Akses</span>
             </div>
             Email login akan diproduksi otomatis menggunakan nomor HP. Password awal akan dikosongkan (login via OTP WhatsApp).
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              className="flex-1" 
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
              className="flex-1" 
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
