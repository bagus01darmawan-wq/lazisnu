'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
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
  User,
  PlusCircle,
  RotateCcw
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const canSchema = z.object({
  ownerName: z.string().min(1, 'Nama pemilik wajib diisi'),
  branchId: z.string().uuid('Pilih ranting'),
  dukuhId: z.string().uuid('Pilih dukuh'),
  rt: z.string().min(1, 'Pilih RT'),
  rw: z.string().min(1, 'Pilih RW'),
  ownerWhatsapp: z.string().min(10, 'Nomor WhatsApp minimal 10 digit'),
});

type CanFormValues = z.infer<typeof canSchema>;

export default function CansPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDukuhModalOpen, setIsDukuhModalOpen] = useState(false);
  const [editingCan, setEditingCan] = useState<any>(null);
  const [branches, setBranches] = useState([]);
  const [dukuhs, setDukuhs] = useState([]);
  const [newDukuhName, setNewDukuhName] = useState('');
  
  // Pagination & Filter states
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CanFormValues>({
    resolver: zodResolver(canSchema as any),
  });

  const selectedBranchId = watch('branchId');

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

  const handleAddDukuh = async () => {
    if (!selectedBranchId) {
      alert('Pilih ranting terlebih dahulu');
      return;
    }
    if (!newDukuhName) return;
    
    try {
      const response: any = await api.post('/admin/dukuhs', {
        branchId: selectedBranchId,
        name: newDukuhName
      });
      if (response.success) {
        setNewDukuhName('');
        setIsDukuhModalOpen(false);
        await fetchDukuhs(selectedBranchId);
        setValue('dukuhId', response.data.id);
      }
    } catch (error) {
      alert('Gagal menambah dukuh');
    }
  };

  const handleDeleteDukuh = async (id: string, name: string) => {
    if (!confirm(`Hapus dukuh ${name}? Dukuh hanya bisa dihapus jika tidak digunakan oleh data kaleng manapun.`)) return;
    try {
      const response: any = await api.delete(`/admin/dukuhs/${id}`);
      if (response.success) {
        await fetchDukuhs(selectedBranchId);
      }
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Gagal menghapus dukuh');
    }
  };

  const onSubmit = async (values: any) => {
    try {
      const payload = {
        owner_name: values.ownerName,
        owner_whatsapp: values.ownerWhatsapp,
        branch_id: values.branchId,
        dukuh_id: values.dukuhId,
        rt: values.rt,
        rw: values.rw,
        owner_address: values.ownerAddress || '',
      };

      if (editingCan) {
        const response: any = await api.put(`/admin/cans/${editingCan.id}`, payload);
        if (response.success) {
          setIsModalOpen(false);
          setEditingCan(null);
          await fetchData();
          alert('Data kaleng berhasil diperbarui');
        }
      } else {
        const response: any = await api.post('/admin/cans', payload);
        if (response.success) {
          setIsModalOpen(false);
          reset();
          await fetchData();
          alert('Kaleng baru berhasil ditambahkan');
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Gagal menyimpan data');
    }
  };

  const handleEdit = (can: any) => {
    setEditingCan(can);
    setValue('ownerName', can.ownerName);
    setValue('branchId', can.branchId);
    setValue('dukuhId', can.dukuhId);
    setValue('rt', can.rt || '');
    setValue('rw', can.rw || '');
    setValue('ownerWhatsapp', can.ownerWhatsapp || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menonaktifkan kaleng ini?')) return;
    try {
      const response: any = await api.delete(`/admin/cans/${id}`);
      if (response.success) {
        fetchData();
      }
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Gagal menghapus data');
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'qrCode',
      header: 'QR CODE',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
            <QrCode size={14} className="text-green-600" />
          </div>
          <span className="font-bold text-slate-700">{row.original.qrCode}</span>
        </div>
      ),
    },
    {
      accessorKey: 'ownerName',
      header: 'PEMILIK',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.original.ownerName}</span>
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
            {row.original.branch?.name.replace(/ranting/gi, '').trim() || 'No Branch'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'address',
      header: 'ALAMAT',
      cell: ({ row }) => (
        <div className="flex flex-col text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <MapPin size={10} />
            <span>{row.original.dukuhDetails?.name || row.original.dukuh || '-'}</span>
          </div>
          <span className="ml-3.5 opacity-70">RT {row.original.rt || '-'} / RW {row.original.rw || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'ownerWhatsapp',
      header: 'WHATSAPP',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 w-fit">
          <Phone size={12} className="text-green-500" />
          {row.original.ownerWhatsapp}
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'STATUS',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'failed'}>
          {row.original.isActive ? 'AKTIF' : 'NON-AKTIF'}
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
            className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200 group"
            onClick={() => handleEdit(row.original)}
          >
            <Edit size={14} className="text-slate-500 group-hover:text-green-600" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all border-slate-200 group"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 size={14} className="text-slate-500 group-hover:text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Box className="text-green-600" size={28} />
            Kelola Kaleng Infaq
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Manajemen data donatur dan distribusi kaleng Lazisnu</p>
        </div>
        <Button 
          onClick={() => {
            setEditingCan(null);
            reset();
            setIsModalOpen(true);
          }}
          className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 px-6 h-11 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus size={20} />
          Tambah Kaleng Baru
        </Button>
      </div>

      {/* Toolbar Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full lg:w-96 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-slate-400 group-focus-within:text-green-500 transition-colors" size={18} />
          </div>
          <input
            type="text"
            placeholder="Cari nama pemilik atau wilayah..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 focus:bg-white transition-all shadow-sm group-hover:border-slate-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {user?.role === 'ADMIN_KECAMATAN' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
              <Filter className="text-slate-400 ml-2" size={16} />
              <select 
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer max-w-[150px]"
              >
                <option value="">SEMUA RANTING</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name.replace(/ranting/gi, '').trim().toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
            <RotateCcw className="text-slate-400 ml-2" size={16} />
            <select 
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="ACTIVE">AKTIF</option>
              <option value="INACTIVE">NON-AKTIF</option>
              <option value="ALL">SEMUA STATUS</option>
            </select>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500 border-slate-200 hover:bg-slate-50 flex items-center gap-2"
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

          {/* Selector Baris removed from here */}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <Table columns={columns} data={data} loading={loading} />
        
        {/* Pagination Controls */}
        {!loading && totalItems > 0 && (
          <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
            <p className="text-xs font-medium text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{data.length}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> kaleng
            </p>
            
            <div className="flex items-center gap-4">
              {/* Selector Baris moved here */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
                <select 
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
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

      {/* Modal Tambah/Edit Kaleng */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingCan(null);
        }}
        title={editingCan ? "Edit Data Kaleng" : "Tambah Kaleng Baru"}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Nama Lengkap Pemilik</label>
            <Input {...register('ownerName')} placeholder="Contoh: Bpk. Slamet" />
            {errors.ownerName && <p className="text-xs font-medium text-red-500">{errors.ownerName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Ranting (Desa)</label>
            <select 
              {...register('branchId')}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="">-- Pilih Ranting --</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name.replace(/ranting/gi, '').trim().toUpperCase()}
                </option>
              ))}
            </select>
            {errors.branchId && <p className="text-xs font-medium text-red-500">{errors.branchId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Dukuh</label>
            <div className="flex gap-2">
              <select 
                {...register('dukuhId')}
                disabled={!selectedBranchId}
                className="flex-1 h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">-- Pilih Dukuh --</option>
                {dukuhs.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <Button 
                type="button"
                variant="outline"
                className="h-11 w-11 p-0 rounded-xl border-slate-200 hover:border-green-500 hover:text-green-600 transition-colors"
                onClick={() => setIsDukuhModalOpen(true)}
                disabled={!selectedBranchId}
              >
                <PlusCircle size={20} />
              </Button>
            </div>
            {errors.dukuhId && <p className="text-xs font-medium text-red-500">{errors.dukuhId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">RT</label>
              <select 
                {...register('rt')}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="">-- RT --</option>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={(i + 1).toString().padStart(3, '0')}>
                    {(i + 1).toString().padStart(3, '0')}
                  </option>
                ))}
              </select>
              {errors.rt && <p className="text-xs font-medium text-red-500">{errors.rt.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">RW</label>
              <select 
                {...register('rw')}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="">-- RW --</option>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={(i + 1).toString().padStart(3, '0')}>
                    {(i + 1).toString().padStart(3, '0')}
                  </option>
                ))}
              </select>
              {errors.rw && <p className="text-xs font-medium text-red-500">{errors.rw.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider text-[10px] text-green-600 font-bold">Nomor WhatsApp (Wajib)</label>
            <div className="relative group">
               <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-500 transition-colors" size={16} />
               <input 
                 {...register('ownerWhatsapp')} 
                 placeholder="Contoh: 628123456789"
                 className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition-all"
               />
            </div>
            {errors.ownerWhatsapp && <p className="text-xs font-medium text-red-500">{errors.ownerWhatsapp.message}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              className="flex-1 rounded-xl h-12 font-bold" 
              onClick={() => {
                setIsModalOpen(false);
                setEditingCan(null);
              }}
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-600/20"
            >
              {editingCan ? 'Simpan Perubahan' : 'Simpan Kaleng'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Tambah Dukuh */}
      <Modal 
        isOpen={isDukuhModalOpen} 
        onClose={() => setIsDukuhModalOpen(false)}
        title="Kelola Dukuh"
      >
        <div className="space-y-6">
          <div className="space-y-1.5 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tambah Dukuh Baru</label>
            <div className="flex gap-2">
              <Input 
                value={newDukuhName}
                onChange={(e) => setNewDukuhName(e.target.value)}
                placeholder="Nama Dukuh..." 
                className="bg-white"
              />
              <Button className="bg-green-600 text-white rounded-xl px-6" onClick={handleAddDukuh}>Tambah</Button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daftar Dukuh Terdaftar</label>
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {dukuhs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  Belum ada data dukuh
                </div>
              ) : (
                dukuhs.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-colors group">
                    <span className="text-sm font-medium text-slate-700">{d.name}</span>
                    <button 
                      onClick={() => handleDeleteDukuh(d.id, d.name)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 group-hover:bg-red-50"
                    >
                      <Trash2 size={16} className="transition-colors" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button variant="secondary" className="w-full rounded-xl h-11" onClick={() => setIsDukuhModalOpen(false)}>Selesai</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
