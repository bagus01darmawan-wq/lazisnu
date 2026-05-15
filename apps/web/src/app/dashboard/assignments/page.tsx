'use client';
// Force rebuild - updating auth store import

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { toast } from 'sonner';
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
  RotateCcw,
  UserCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/useAuthStore';
import * as z from 'zod';
import { FilterPills } from '@/components/ui/FilterPills';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { cn } from '@/lib/utils';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { ConfirmToast } from '@/components/ui/ConfirmToast';

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkReassignModalOpen, setIsBulkReassignModalOpen] = useState(false);
  const [bulkReassignOfficerId, setBulkReassignOfficerId] = useState('');

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

  const toggleSelectAll = () => {
    if (data.length === 0) return;
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map((item: any) => item.id));
    }
  };

  const toggleSelectId = (item: any) => {
    setSelectedIds(prev =>
      prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]
    );
  };

  const handleBulkDeleteAssignment = async () => {
    if (selectedIds.length === 0) return;

    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title="Hapus Massal?"
        description={`Hapus ${selectedIds.length} penugasan terpilih?`}
        confirmLabel="Ya, Hapus"
        onConfirm={async () => {
          toast.loading('Menghapus...');
          try {
            await Promise.all(selectedIds.map(id => api.delete(`/admin/assignments/${id}`)));
            toast.dismiss();
            toast.success(`Berhasil menghapus ${selectedIds.length} penugasan`);
            setSelectedIds([]);
            fetchData();
          } catch (error: any) {
            toast.dismiss();
            toast.error('Gagal menghapus beberapa penugasan');
          }
        }}
        variant="danger"
      />
    ), { duration: 5000 });
  };

  const handleBulkReassign = async () => {
    if (selectedIds.length === 0 || !bulkReassignOfficerId) return;
    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        selectedIds.map(id =>
          api.put(`/admin/assignments/${id}`, {
            officer_id: bulkReassignOfficerId,
            status: 'REASSIGNED'
          })
        )
      );
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      toast.success(`Berhasil re-assign ${successCount} dari ${selectedIds.length} penugasan`);
      setIsBulkReassignModalOpen(false);
      setBulkReassignOfficerId('');
      setSelectedIds([]);
      fetchData();
    } catch (error) {
      toast.error('Gagal melakukan re-assign massal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAssignment = (id: string) => {
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title="Hapus Penugasan?"
        description="Tindakan ini akan membatalkan jadwal penjemputan untuk kaleng tersebut di bulan berjalan."
        confirmLabel="Ya, Hapus"
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/assignments/${id}`).then((res: any) => {
              fetchData();
              return res;
            }),
            {
              loading: 'Sedang menghapus...',
              success: 'Berhasil dihapus',
              error: (err: any) => err.response?.data?.error?.message || 'Gagal menghapus',
            }
          );
        }}
      />
    ), { duration: 5000 });
  };

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const columns: ColumnDef<any>[] = [
    {
      id: 'selection',
      header: () => {
        const isAllSelected = data.length > 0 && selectedIds.length === data.length;
        return (
          <button
            onClick={toggleSelectAll}
            disabled={data.length === 0}
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
      cell: ({ row }) => (
        <button
          onClick={() => toggleSelectId(row.original)}
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
      accessorKey: 'can',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Box size={12} className="text-[#EAD19B]" />
          <span>Kaleng / Pemilik</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <p className="font-bold text-[#F4F1EA] tracking-tight">{row.original.can.owner_name}</p>
          <p className="text-[10px] text-[#EAD19B]/60 font-bold uppercase tracking-widest mt-0.5">
            {row.original.can.branch_name?.replace(/ranting/gi, '').trim() || 'PUSAT'}
          </p>
          <p className="text-[10px] text-[#F4F1EA]/40 font-bold tracking-tight mt-1">
            #{row.original.can.qr_code}
          </p>
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
        <div className="flex flex-col text-xs font-medium text-[#F4F1EA]/60">
          <span className="uppercase tracking-tight">{row.original.can.dukuh_name || row.original.can.dukuh || '-'}</span>
          <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest mt-0.5">
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
          <span>Petugas Lapangan</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA]">{row.original.officer.full_name}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest mt-0.5">
            {row.original.officer.branch_name?.replace(/ranting/gi, '').trim() || 'PUSAT'}
          </span>
        </div>
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
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium uppercase tracking-tight text-[#F4F1EA]/60">
            {months[row.original.period_month - 1]}
          </span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold tracking-[0.2em]">
            {row.original.period_year}
          </span>
        </div>
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
      cell: ({ row }) => {
        const statuses = {
          ACTIVE: { label: 'ASSIGNED', color: 'text-[#DE6F4A]' },
          COMPLETED: { label: 'SELESAI', color: 'text-[#1F8243]' },
          POSTPONED: { label: 'TERTUNDA', color: 'text-[#EAD19B]' },
          REASSIGNED: { label: 'RE-ASSIGN', color: 'text-[#EAD19B]' },
        };
        const s = statuses[row.original.status as keyof typeof statuses] || statuses.ACTIVE;
        return (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${s.color}`}>
            {s.label}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 group"
            title="Transfer Penugasan"
            onClick={() => {
              setTransferringAssignment(row.original);
              setIsTransferModalOpen(true);
            }}
          >
            <Repeat size={14} className="text-[#EAD19B]" />
          </Button>

          {user?.role === 'ADMIN_KECAMATAN' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#D97A76] hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300 group"
              title="Hapus Penugasan"
              onClick={() => handleDeleteAssignment(row.original.id)}
            >
              <Trash2 size={14} className="text-[#F4F1EA]/40 group-hover:text-[#D97A76]" />
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

        <div className="flex items-center gap-4">
          {/* Bulk Action Pill Wrapper */}
          {selectedIds.length > 0 && (
            <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
              <div className="bg-[#1F8243]/5 backdrop-blur-sm rounded-xl border border-[#1F8243]/10">
                <button
                  onClick={() => setIsBulkReassignModalOpen(true)}
                  className="h-[33px] px-4 rounded-xl text-[11px] font-bold text-[#F4F1EA] hover:bg-[#1F8243]/10 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Repeat size={14} strokeWidth={3} />
                  Re-Assign ({selectedIds.length})
                </button>
              </div>
              {user?.role === 'ADMIN_KECAMATAN' && (
                <button
                  onClick={handleBulkDeleteAssignment}
                  className="h-[33px] px-4 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-2 text-[#D97A76] hover:bg-[#D97A76]/10"
                >
                  <Trash2 size={14} strokeWidth={3} />
                  Hapus ({selectedIds.length})
                </button>
              )}
            </div>
          )}

          {/* Primary Action Button */}
          <Button
            onClick={() => {
              reset({
                branch_id: '',
                officer_id: '',
                dukuh_ids: []
              });
              setIsModalOpen(true);
            }}
            className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus size={14} strokeWidth={3} />
            Tugaskan Petugas
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
          <PeriodPicker
            month={filter.month}
            year={filter.year}
            onChange={(m, y) => {
              setFilter({ month: m, year: y });
              setCurrentPage(1);
            }}
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
              setFilter({ year: currentYear, month: currentMonth });
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
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Tugas</span>
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Penugasan */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Penugasan"
        variant="glass"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-[#1F8243]/10 p-4 rounded-2xl border border-[#1F8243]/20 flex gap-3 text-[#F4F1EA] mb-2">
            <Clock size={20} className="shrink-0 text-[#1F8243]" />
            <div className="text-xs text-[#F4F1EA]/60">
              <p className="font-bold mb-0.5 uppercase tracking-wider">Periode Berjalan</p>
              Penugasan akan otomatis dibuat untuk bulan <span className="font-bold text-[#EAD19B]">{months[currentMonth - 1]} {currentYear}</span>.
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Petugas Lapangan</label>
            <GlassSelect
              value={watch('officer_id') || ''}
              onChange={(val) => setValue('officer_id', val)}
              placeholder="-- Pilih Petugas --"
              options={officers.map((o: any) => ({
                label: `${o.full_name} (${o.employee_code})`,
                value: o.id
              }))}
              error={errors.officer_id?.message}
              searchable
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Ranting (Desa)</label>
            <GlassSelect
              value={watch('branch_id') || ''}
              onChange={(val) => setValue('branch_id', val)}
              placeholder="-- Deteksi Ranting Otomatis --"
              options={branches.map((b: any) => ({
                label: b.name.replace(/ranting/gi, '').trim().toUpperCase(),
                value: b.id
              }))}
              error={errors.branch_id?.message}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Dukuh (Bisa lebih dari satu)</label>
            <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03] space-y-2">
              {selectedBranchId ? (
                <>
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
                    <input
                      type="checkbox"
                      id="selectAllDukuh"
                      className="w-4 h-4 rounded border-white/20 text-[#EAD19B] focus:ring-[#EAD19B]/30"
                      checked={modalDukuhs.length > 0 && watch('dukuh_ids').length === modalDukuhs.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setValue('dukuh_ids', modalDukuhs.map(d => d.id));
                        } else {
                          setValue('dukuh_ids', []);
                        }
                      }}
                    />
                    <label htmlFor="selectAllDukuh" className="text-xs font-bold text-[#F4F1EA]/60 cursor-pointer">PILIH SEMUA DUKUH</label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                    {modalDukuhs.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`dukuh-${d.id}`}
                          value={d.id}
                          className="w-4 h-4 rounded border-white/20 text-[#EAD19B] focus:ring-[#EAD19B]/30"
                          {...register('dukuh_ids')}
                        />
                        <label htmlFor={`dukuh-${d.id}`} className="text-sm text-[#F4F1EA] cursor-pointer">{d.name}</label>
                      </div>
                    ))}
                    {modalDukuhs.length === 0 && !fetchingDukuhs && (
                      <p className="text-xs text-[#F4F1EA]/40 italic">Tidak ada data dukuh di ranting ini</p>
                    )}
                    {fetchingDukuhs && <p className="text-xs text-[#F4F1EA]/40">Memuat data...</p>}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[#F4F1EA]/40 italic">Pilih petugas terlebih dahulu untuk deteksi ranting & dukuh</p>
              )}
            </div>
            {errors.dukuh_ids && <p className="text-xs font-medium text-red-400">{errors.dukuh_ids.message}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
              onClick={() => setIsModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
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
        variant="glass"
      >
        {transferringAssignment && (
          <div className="space-y-6">
            <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase">Kaleng / Pemilik</span>
                <span className="text-xs font-bold text-[#F4F1EA]">{transferringAssignment.can.qr_code}</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/10 pt-3">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase">Petugas Saat Ini</span>
                <span className="text-xs font-bold text-[#D97A76]">{transferringAssignment.officer.full_name}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Petugas Pengganti</label>
                <GlassSelect
                  value={transferringAssignment.newOfficerId || ''}
                  onChange={(val) => setTransferringAssignment({ ...transferringAssignment, newOfficerId: val })}
                  placeholder="-- Pilih Petugas Baru --"
                  options={officers
                    .filter((o: any) => o.id !== transferringAssignment.officer_id && o.branch_id === transferringAssignment.can.branch_id)
                    .map((o: any) => ({
                      label: `${o.full_name} (${o.employee_code})`,
                      value: o.id
                    }))}
                  searchable
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
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

      {/* Modal Bulk Re-Assign */}
      <Modal
        isOpen={isBulkReassignModalOpen}
        onClose={() => {
          setIsBulkReassignModalOpen(false);
          setBulkReassignOfficerId('');
        }}
        title="Re-Assign Massal"
        variant="glass"
      >
        <div className="space-y-6">
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/10">
            <p className="text-sm text-[#F4F1EA]/60">
              Akan memindahkan <span className="font-bold text-[#EAD19B]">{selectedIds.length}</span> penugasan ke petugas baru.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#F4F1EA]/60">Pilih Petugas Pengganti</label>
              <GlassSelect
                value={bulkReassignOfficerId}
                onChange={(val) => setBulkReassignOfficerId(val)}
                placeholder="-- Pilih Petugas Baru --"
                options={officers.map((o: any) => ({
                  label: `${o.full_name} (${o.employee_code})`,
                  value: o.id
                }))}
                searchable
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:bg-white/10 hover:text-[#F4F1EA]"
                onClick={() => {
                  setIsBulkReassignModalOpen(false);
                  setBulkReassignOfficerId('');
                }}
              >
                Batal
              </Button>
              <Button
                className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
                isLoading={submitting}
                disabled={!bulkReassignOfficerId}
                onClick={handleBulkReassign}
              >
                Konfirmasi Re-Assign
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
