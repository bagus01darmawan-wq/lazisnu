'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { 
  ClipboardList, 
  Plus, 
  Calendar, 
  User, 
  Box, 
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const assignmentSchema = z.object({
  can_id: z.string().uuid('Pilih kaleng'),
  officer_id: z.string().uuid('Pilih petugas'),
  backup_officer_id: z.string().uuid().optional().or(z.literal('')),
  period_year: z.number().min(2020),
  period_month: z.number().min(1).max(12),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

export default function AssignmentsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [cans, setCans] = useState([]);
  const [officers, setOfficers] = useState([]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [filter, setFilter] = useState({
    year: currentYear,
    month: currentMonth
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      period_year: currentYear,
      period_month: currentMonth
    }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/assignments', { params: filter });
      if (response.success) {
        setData(response.data.assignments);
      }
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [cansRes, officersRes]: any = await Promise.all([
        api.get('/admin/cans', { params: { status: 'ACTIVE', limit: 300 } }),
        api.get('/admin/officers', { params: { limit: 300, is_active: true } })
      ]);
      // The API now returns { success: true, data: { cans, pagination } }
      if (cansRes.success) setCans(cansRes.data.cans || []);
      if (officersRes.success) setOfficers(officersRes.data.officers || []);
    } catch (error: any) {
      console.error('Failed to fetch dropdown data:', error.response?.data || error.message || error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filter]);

  useEffect(() => {
    if (isModalOpen) fetchDropdowns();
  }, [isModalOpen]);

  const onSubmit = async (values: AssignmentFormValues) => {
    setSubmitting(true);
    try {
      const submitData = { ...values };
      if (!submitData.backup_officer_id) delete submitData.backup_officer_id;
      
      const response: any = await api.post('/admin/assignments', submitData);
      if (response.success) {
        reset();
        setIsModalOpen(false);
        fetchData();
      }
    } catch (error: any) {
      console.error('Failed to create assignment:', error.response?.data || error.message || error);
      alert(error.response?.data?.error?.message || 'Gagal menyimpan penugasan');
    } finally {
      setSubmitting(false);
    }
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
            <p className="font-bold text-slate-900">{row.original.can.qrCode}</p>
            <p className="text-xs text-slate-500">{row.original.can.ownerName}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'officer',
      header: 'Petugas Lapangan',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-slate-700">
          <User size={14} className="text-slate-400" />
          <span className="font-medium">{row.original.officer.fullName}</span>
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
            {months[row.original.periodMonth - 1]} {row.original.periodYear}
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
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg">
            <MoreVertical size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Penugasan Rutin</h1>
          <p className="text-slate-500 text-sm">Atur jadwal pengambilan infaq bulanan petugas</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
        >
          <Plus size={18} className="mr-2" />
          Tugaskan Petugas
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Calendar className="text-slate-400" size={18} />
          <select 
            value={filter.month}
            onChange={(e) => setFilter({...filter, month: parseInt(e.target.value)})}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select 
            value={filter.year}
            onChange={(e) => setFilter({...filter, year: parseInt(e.target.value)})}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
          >
            {[currentYear, currentYear - 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Table columns={columns} data={data} loading={loading} />

      {/* Modal Penugasan */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Buat Penugasan Baru"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Kaleng / Donatur</label>
            <select 
              {...register('can_id')}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
            >
              <option value="">-- Pilih Kaleng --</option>
              {cans.map((c: any) => (
                <option key={c.id} value={c.id}>{c.qrCode} - {c.ownerName}</option>
              ))}
            </select>
            {errors.can_id && <p className="text-xs font-medium text-red-500">{errors.can_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Pilih Petugas Utama</label>
            <select 
              {...register('officer_id')}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
            >
              <option value="">-- Pilih Petugas --</option>
              {officers.map((o: any) => (
                <option key={o.id} value={o.id}>{o.fullName} ({o.employeeCode})</option>
              ))}
            </select>
            {errors.officer_id && <p className="text-xs font-medium text-red-500">{errors.officer_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Bulan</label>
              <select 
                {...register('period_month', { valueAsNumber: true })}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Tahun</label>
              <select 
                {...register('period_year', { valueAsNumber: true })}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
              >
                <option value={currentYear}>{currentYear}</option>
                <option value={currentYear + 1}>{currentYear + 1}</option>
              </select>
            </div>
          </div>

          <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 flex gap-3 text-yellow-800">
             <AlertTriangle size={20} className="shrink-0" />
             <div className="text-xs">
               <p className="font-bold mb-0.5">Peringatan Duplikasi</p>
               Satu kaleng hanya bisa ditugaskan ke satu petugas dalam satu bulan yang sama.
             </div>
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
    </div>
  );
}
