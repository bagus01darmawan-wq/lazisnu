'use client';
// Force rebuild - updating auth store import

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
  ClipboardList, 
  Plus, 
  Calendar, 
  User, 
  Box, 
  ChevronRight,
  MoreVertical,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Repeat,
  Trash2,
  MapPin,
  RotateCcw
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/useAuthStore';
import * as z from 'zod';

const assignmentSchema = z.object({
  branch_id: z.string().uuid('Pilih ranting'),
  officer_id: z.string().uuid('Pilih petugas'),
  dukuh_ids: z.array(z.string().uuid()).min(1, 'Pilih minimal satu dukuh'),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

export default function AssignmentsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferringAssignment, setTransferringAssignment] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [cans, setCans] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [modalDukuhs, setModalDukuhs] = useState<any[]>([]);
  const [fetchingDukuhs, setFetchingDukuhs] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [filter, setFilter] = useState({
    year: currentYear,
    month: currentMonth
  });
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema as any),
    defaultValues: {
      dukuh_ids: []
    }
  });

  const selectedBranchId = watch('branch_id');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/assignments', { 
        params: { 
          ...filter,
          search,
          branch_id: branchFilter,
          page: currentPage,
          limit: pageSize
        } 
      });
      if (response.success) {
        setData(response.data.items || []);
        setTotalItems(response.data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [branchesRes, officersRes]: any = await Promise.all([
        api.get('/admin/branches'),
        api.get('/admin/officers', { params: { limit: 300, is_active: true } })
      ]);
      if (branchesRes.success) setBranches(branchesRes.data || []);
      if (officersRes.success) setOfficers(officersRes.data.items || []);
    } catch (error: any) {
      console.error('Failed to fetch dropdown data:', error.response?.data || error.message || error);
    }
  };

  const fetchDukuhsModal = async (branchId: string) => {
    if (!branchId || branchId === '') {
      setModalDukuhs([]);
      return;
    }
    
    // Clear previous dukuhs immediately to avoid "sneaking" stale data
    setModalDukuhs([]);
    setFetchingDukuhs(true);
    
    try {
      const response: any = await api.get('/admin/dukuhs', { 
        params: { 
          branch_id: branchId,
          filter_assigned: true 
        } 
      });
      
      // Safety check: only update if the branch hasn't changed in the meantime
      if (response.success) {
        setModalDukuhs(response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch dukuhs for modal:', error);
    } finally {
      setFetchingDukuhs(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filter, search, branchFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchDropdowns();
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      fetchDukuhsModal(selectedBranchId);
    }
  }, [selectedBranchId, isModalOpen]);

  const selectedOfficerId = watch('officer_id');

  useEffect(() => {
    if (selectedOfficerId) {
      const officer: any = officers.find((o: any) => o.id === selectedOfficerId);
      if (officer && officer.branch_id) {
        setValue('branch_id', officer.branch_id, { shouldValidate: true });
      }
    } else {
      setValue('branch_id', '', { shouldValidate: true });
    }
  }, [selectedOfficerId, officers]);

  useEffect(() => {
    setValue('dukuh_ids', []);
  }, [selectedBranchId]);

  const onSubmit = async (values: AssignmentFormValues) => {
    setSubmitting(true);
    try {
      const response: any = await api.post('/admin/assignments/bulk-branch', values);
      if (response.success) {
        reset();
        setIsModalOpen(false);
        fetchData();
        toast.success(`Berhasil! ${response.data.assigned_count} kaleng telah ditugaskan untuk periode ${response.data.period}`);
      }
    } catch (error: any) {
      const errorData = error.response?.data || error;
      console.error('Failed to create bulk assignment:', JSON.stringify(errorData, null, 2));
      toast.error(errorData.error?.message || error.message || 'Gagal menyimpan penugasan massal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (values: { officer_id: string }) => {
    if (!transferringAssignment) return;
    setSubmitting(true);
    try {
      const response: any = await api.put(`/admin/assignments/${transferringAssignment.id}`, {
        officer_id: values.officer_id,
        status: 'REASSIGNED'
      });
      if (response.success) {
        setIsTransferModalOpen(false);
        setTransferringAssignment(null);
        fetchData();
        toast.success('Penugasan berhasil ditransfer!');
      }
    } catch (error: any) {
      console.error('Failed to transfer assignment:', error);
      toast.error('Gagal mentransfer penugasan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAssignment = (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} />
          <p className="text-sm font-bold">Hapus penugasan ini?</p>
        </div>
        <p className="text-[11px] text-slate-500 font-medium px-1">
          Tindakan ini akan membatalkan jadwal penjemputan untuk kaleng tersebut di bulan berjalan.
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
            className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs font-bold rounded-lg shadow-sm shadow-red-200 transition-all active:scale-95"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const response: any = await api.delete(`/admin/assignments/${id}`);
                if (response.success) {
                  toast.success('Penugasan berhasil dihapus');
                  fetchData();
                }
              } catch (error: any) {
                toast.error(error.response?.data?.error?.message || 'Gagal menghapus penugasan');
              }
            }}
          >
            Ya, Hapus
          </Button>
        </div>
      </div>
    ), { duration: 5000 });
  };

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'can',
      header: 'Kaleng / Pemilik',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Box size={16} />
          </div>
          <div>
            <p className="font-bold text-slate-900">{row.original.can.qr_code}</p>
            <p className="text-xs text-slate-500">{row.original.can.owner_name}</p>
            <p className="text-xs text-slate-500">{row.original.can.branch_name?.replace(/ranting/gi, '').trim()}</p>
          </div>
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
            <span>{row.original.can.dukuh_name || row.original.can.dukuh || '-'}</span>
          </div>
          <span className="ml-3.5 opacity-70">RT {row.original.can.rt || '-'} / RW {row.original.can.rw || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'officer',
      header: 'Petugas Lapangan',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <User size={14} className="text-slate-400" />
            <span className="font-bold text-slate-900">{row.original.officer.full_name}</span>
          </div>
          <span className="text-[10px] text-slate-600 ml-5 font-medium">
            {row.original.officer.branch_name?.replace(/ranting/gi, '').trim()}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'period',
      header: 'Periode',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar size={14} className="text-slate-400" />
          <span className="text-sm font-semibold">
            {months[row.original.period_month - 1]} {row.original.period_year}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const statuses = {
          ACTIVE: { label: 'Aktif', variant: 'sent' as const, icon: <Clock size={12} className="mr-1" /> },
          COMPLETED: { label: 'Selesai', variant: 'sent' as const, icon: <CheckCircle2 size={12} className="mr-1" /> },
          POSTPONED: { label: 'Tertunda', variant: 'pending' as const, icon: <Clock size={12} className="mr-1" /> },
          REASSIGNED: { label: 'Re-assign', variant: 'default' as const, icon: <ChevronRight size={12} className="mr-1" /> },
        };
        const s = statuses[row.original.status as keyof typeof statuses] || statuses.ACTIVE;
        return (
          <Badge variant={s.variant} className="flex items-center">
            {s.icon}
            {s.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 transition-colors border-slate-200"
            title="Transfer Penugasan"
            onClick={() => {
              setTransferringAssignment(row.original);
              setIsTransferModalOpen(true);
            }}
          >
            <Repeat size={14} />
          </Button>

          {user?.role === 'ADMIN_KECAMATAN' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all border-slate-200 group ml-2"
              title="Hapus Penugasan"
              onClick={() => handleDeleteAssignment(row.original.id)}
            >
              <Trash2 size={14} className="text-slate-400 group-hover:text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Penugasan Rutin</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Atur jadwal pengambilan infaq bulanan petugas</p>
          </div>
        </div>
        <Button 
          onClick={() => {
            reset({
              branch_id: '',
              officer_id: '',
              dukuh_ids: []
            });
            setIsModalOpen(true);
          }}
          className="bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 px-6 h-11 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus size={20} />
          Tugaskan Petugas
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full lg:w-96 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-slate-400 group-focus-within:text-green-500 transition-colors" size={18} />
          </div>
          <input
            type="text"
            placeholder="Cari QR, pemilik, atau petugas..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 focus:bg-white transition-all shadow-sm group-hover:border-slate-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm">
            <Calendar className="text-slate-400 ml-2" size={16} />
            <select 
              value={filter.month}
              onChange={(e) => {
                setFilter({...filter, month: parseInt(e.target.value)});
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 px-2 py-1.5 focus:outline-none cursor-pointer"
            >
              {months.map((m, i) => {
                const isFuture = mounted && (filter.year > currentYear || (filter.year === currentYear && i + 1 > currentMonth));
                return (
                  <option key={m} value={i + 1} disabled={isFuture} className={isFuture ? 'text-slate-300' : 'text-slate-900'}>
                    {m.toUpperCase()}
                  </option>
                );
              })}
            </select>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <select 
              value={filter.year}
              onChange={(e) => {
                setFilter({...filter, year: parseInt(e.target.value)});
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 px-2 py-1.5 focus:outline-none cursor-pointer"
            >
              {[currentYear, currentYear - 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
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
              setFilter({ year: currentYear, month: currentMonth });
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
              Menampilkan <span className="font-bold text-slate-900">{data.length}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> tugas
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

      {/* Modal Penugasan */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Penugasan"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex gap-3 text-green-800 mb-2">
             <Clock size={20} className="shrink-0" />
             <div className="text-xs">
               <p className="font-bold mb-0.5 uppercase tracking-wider">Periode Berjalan</p>
               Penugasan akan otomatis dibuat untuk bulan <span className="font-bold">{months[currentMonth-1]} {currentYear}</span>.
             </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Petugas Lapangan</label>
            <select 
              {...register('officer_id')}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="">-- Pilih Petugas --</option>
              {officers.map((o: any) => (
                <option key={o.id} value={o.id}>{o.full_name} ({o.employee_code})</option>
              ))}
            </select>
            {errors.officer_id && <p className="text-xs font-medium text-red-500">{errors.officer_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Ranting (Desa)</label>
            <select 
              {...register('branch_id')}
              className={`w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-medium outline-none shadow-sm pointer-events-none ${selectedBranchId ? 'bg-slate-100 text-slate-900' : 'bg-slate-50 text-slate-400'}`}
              tabIndex={-1}
            >
              <option value="">-- Deteksi Ranting Otomatis --</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name.replace(/ranting/gi, '').trim().toUpperCase()}
                </option>
              ))}
            </select>
            {errors.branch_id && <p className="text-xs font-medium text-red-500">{errors.branch_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Dukuh (Bisa lebih dari satu)</label>
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
              {selectedBranchId ? (
                <>
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-2">
                    <input 
                      type="checkbox"
                      id="selectAllDukuh"
                      className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                      checked={modalDukuhs.length > 0 && watch('dukuh_ids').length === modalDukuhs.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setValue('dukuh_ids', modalDukuhs.map(d => d.id));
                        } else {
                          setValue('dukuh_ids', []);
                        }
                      }}
                    />
                    <label htmlFor="selectAllDukuh" className="text-xs font-bold text-slate-700 cursor-pointer">PILIH SEMUA DUKUH</label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                    {modalDukuhs.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2">
                        <input 
                          type="checkbox"
                          id={`dukuh-${d.id}`}
                          value={d.id}
                          className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                          {...register('dukuh_ids')}
                        />
                        <label htmlFor={`dukuh-${d.id}`} className="text-sm text-slate-700 cursor-pointer">{d.name}</label>
                      </div>
                    ))}
                    {modalDukuhs.length === 0 && !fetchingDukuhs && (
                      <p className="text-xs text-slate-500 italic">Tidak ada data dukuh di ranting ini</p>
                    )}
                    {fetchingDukuhs && <p className="text-xs text-slate-500">Memuat data...</p>}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 italic">Pilih petugas terlebih dahulu untuk deteksi ranting & dukuh</p>
              )}
            </div>
            {errors.dukuh_ids && <p className="text-xs font-medium text-red-500">{errors.dukuh_ids.message}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              className="flex-1" 
              onClick={() => setIsModalOpen(false)}
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              isLoading={submitting}
            >
              Simpan Penugasan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Transfer Penugasan */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transfer Penugasan"
      >
        {transferringAssignment && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Kaleng / Pemilik</span>
                <span className="text-xs font-bold text-slate-900">{transferringAssignment.can.qr_code}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Petugas Saat Ini</span>
                <span className="text-xs font-bold text-red-600">{transferringAssignment.officer.full_name}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Pilih Petugas Pengganti</label>
                <select 
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
                  onChange={(e) => setTransferringAssignment({...transferringAssignment, newOfficerId: e.target.value})}
                >
                  <option value="">-- Pilih Petugas Baru --</option>
                  {officers
                    .filter((o: any) => o.id !== transferringAssignment.officer_id && o.branch_id === transferringAssignment.can.branch_id)
                    .map((o: any) => (
                      <option key={o.id} value={o.id}>{o.full_name} ({o.employee_code})</option>
                    ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="secondary" 
                  className="flex-1" 
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Batal
                </Button>
                <Button 
                  className="flex-1" 
                  isLoading={submitting}
                  disabled={!transferringAssignment.newOfficerId}
                  onClick={() => handleTransfer({ officer_id: transferringAssignment.newOfficerId })}
                >
                  Konfirmasi Transfer
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
