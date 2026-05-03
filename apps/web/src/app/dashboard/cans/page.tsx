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
import { toast } from 'react-hot-toast';
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
  AlertTriangle
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importBranchId, setImportBranchId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

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
      
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[250px]">
        <div className="flex items-center gap-2">
          {isPermanent ? <AlertTriangle size={18} className="text-red-600" /> : <Trash2 size={18} className="text-slate-400" />}
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
                const response: any = await api.delete(`/admin/cans/${id}${isPermanent ? '?permanent=true' : ''}`);
                if (response.success) {
                  fetchData();
                  toast.success(isPermanent ? 'Data kaleng berhasil dihapus permanen' : 'Data kaleng berhasil dinonaktifkan');
                }
              } catch (error: any) {
                toast.error(error.error?.message || error.message || 'Gagal memproses penghapusan');
              }
            }}
          >
            {isPermanent ? 'Hapus Permanen' : 'Ya, Nonaktifkan'}
          </Button>
        </div>
      </div>
    ), { duration: 6000, position: 'top-center' });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const isNonActiveView = statusFilter === 'NON_ACTIVE';
    const message = isNonActiveView
      ? `Hapus PERMANEN ${selectedIds.length} kaleng?`
      : `Nonaktifkan ${selectedIds.length} kaleng?`;
      
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} />
          <p className="text-sm font-bold">{message}</p>
        </div>
        <p className="text-[11px] text-slate-500 font-medium px-1">
          {isNonActiveView ? 'Data yang sudah dihapus tidak dapat dikembalikan.' : 'Data akan dipindahkan ke kategori non-aktif.'}
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
                const response: any = await api.post('/admin/cans/bulk-delete', { 
                  ids: selectedIds,
                  permanent: isNonActiveView
                });
                if (response.success) {
                  toast.success(isNonActiveView 
                    ? `Berhasil menghapus permanen ${selectedIds.length} kaleng` 
                    : `Berhasil menonaktifkan ${selectedIds.length} kaleng`
                  );
                  fetchData();
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
    ), { duration: 6000, position: 'top-center' });
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
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[250px]">
        <div className="flex items-center gap-2">
          <RotateCcw size={18} className="text-blue-600" />
          <p className="text-sm font-bold text-slate-800">Aktifkan kembali kaleng ini?</p>
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
                const response: any = await api.put(`/admin/cans/${id}`, { is_active: true });
                if (response.success) {
                  fetchData();
                  toast.success('Data kaleng berhasil diaktifkan kembali');
                }
              } catch (error: any) {
                toast.error(error.error?.message || error.message || 'Gagal mengaktifkan data');
              }
            }}
          >
            Ya, Aktifkan
          </Button>
        </div>
      </div>
    ), { duration: 5000, position: 'top-center' });
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
      accessorKey: 'qr_code',
      header: 'QR CODE',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
            <QrCode size={14} className="text-green-600" />
          </div>
          <span className="font-bold text-slate-700">{row.original.qr_code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'owner_name',
      header: 'PEMILIK',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.original.owner_name}</span>
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
            <span>{row.original.dukuh_details?.name || row.original.dukuh || '-'}</span>
          </div>
          <span className="ml-3.5 opacity-70">RT {row.original.rt || '-'} / RW {row.original.rw || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'owner_whatsapp',
      header: 'WHATSAPP',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 w-fit">
          <Phone size={12} className="text-green-500" />
          {row.original.owner_whatsapp}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'STATUS',
      cell: ({ row }) => {
        const can = row.original;
        const isAssigned = can.assignments && can.assignments.length > 0;

        if (!can.is_active) {
          return <Badge variant="failed">NON-AKTIF</Badge>;
        }

        if (isAssigned) {
          return (
            <Badge
              variant="default"
              className="bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-all flex items-center gap-1.5 group px-3"
              onClick={() => router.push('/dashboard/assignments')}
              title="Klik untuk lihat penugasan"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              ASSIGNED
            </Badge>
          );
        }

        return <Badge variant="success">AKTIF</Badge>;
      },
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
                <Trash2 size={14} className="text-slate-500 group-hover:text-red-600" />
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
          <Box className="text-green-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kelola Kaleng Infaq</h1>
            <p className="text-slate-500 text-sm font-medium">Manajemen data donatur dan distribusi kaleng Lazisnu</p>
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
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="border-green-600 text-green-600 hover:bg-green-50 h-11 rounded-xl font-bold px-5"
          >
            Impor Data
          </Button>
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

      {/* Modal Impor */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Impor Data Kaleng (Massal)"
      >
        <div className="space-y-5">
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
            <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <Filter size={16} /> Panduan Format CSV
            </h4>
            <div className="text-[11px] text-blue-800 space-y-1">
              <p>1. Gunakan file CSV (Comma Separated Values)</p>
              <p>2. Urutan Kolom: <strong>Nama Pemilik, WhatsApp, Nama Dukuh, RT, RW</strong></p>
              <p>3. Contoh Baris: <code className="bg-white px-1 rounded">Budi, 62812345678, Dukuh A, 001, 002</code></p>
              <p>4. Nama Dukuh harus persis dengan yang terdaftar di sistem.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Ranting Tujuan</label>
            <select
              value={importBranchId}
              onChange={(e) => setImportBranchId(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="">-- Pilih Ranting --</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name.replace(/ranting/gi, '').trim().toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih File CSV</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <RefreshCcw className="w-8 h-8 mb-3 text-slate-400" />
                  <p className="mb-2 text-sm text-slate-500">
                    <span className="font-bold">{importFile ? importFile.name : 'Klik untuk unggah'}</span>
                  </p>
                  <p className="text-xs text-slate-400">File CSV saja (Maks 2MB)</p>
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
              className="flex-1 rounded-xl h-12 font-bold"
              onClick={() => setIsImportModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold"
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
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Nama Lengkap Pemilik</label>
            <Input {...register('owner_name')} placeholder="Contoh: Bpk. Slamet" />
            {errors.owner_name && <p className="text-xs font-medium text-red-500">{errors.owner_name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Ranting (Desa)</label>
            <select
              {...register('branch_id')}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="">-- Pilih Ranting --</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name.replace(/ranting/gi, '').trim().toUpperCase()}
                </option>
              ))}
            </select>
            {errors.branch_id && <p className="text-xs font-medium text-red-500">{errors.branch_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Dukuh</label>
            <select
              {...register('dukuh_id')}
              disabled={!selectedBranchId}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">-- Pilih Dukuh --</option>
              {dukuhs.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {errors.dukuh_id && <p className="text-xs font-medium text-red-500">{errors.dukuh_id.message}</p>}
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
                {...register('owner_whatsapp')}
                placeholder="Contoh: 628123456789"
                className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition-all"
              />
            </div>
            {errors.owner_whatsapp && <p className="text-xs font-medium text-red-500">{errors.owner_whatsapp.message}</p>}
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
    </div>
  );
}
