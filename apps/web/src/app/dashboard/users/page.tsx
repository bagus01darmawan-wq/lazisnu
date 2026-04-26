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
  UserMinus
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/store/useAuthStore';

const officerSchema = z.object({
  full_name: z.string().min(1, 'Nama lengkap wajib diisi'),
  phone: z.string().min(10, 'Nomor HP minimal 10 digit'),
  assigned_zone: z.string().optional(),
  photo_url: z.string().url('URL foto tidak valid').optional().or(z.literal('')),
  branch_id: z.string().min(1, 'Pilih ranting').optional(),
});

type OfficerFormValues = z.infer<typeof officerSchema>;

export default function UsersPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState([]);
  const { user } = useAuthStore();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OfficerFormValues>({
    resolver: zodResolver(officerSchema),
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
      const response: any = await api.get('/admin/officers', { params: { search } });
      if (response.success) {
        setData(response.data.items || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch officers:', error.response?.data || error.message || error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOfficers();
  }, [search]);

  useEffect(() => {
    if (user?.role === 'ADMIN_KECAMATAN') fetchBranches();
  }, [user]);

  const onSubmit = async (values: OfficerFormValues) => {
    setSubmitting(true);
    try {
      // Clean up empty photo_url
      const submitData = { ...values };
      if (!submitData.photo_url) delete submitData.photo_url;

      const response: any = await api.post('/admin/officers', submitData);
      if (response.success) {
        reset();
        setIsModalOpen(false);
        fetchOfficers();
      }
    } catch (error: any) {
      console.error('Failed to create officer:', error.response?.data || error.message || error);
      alert(error.response?.data?.error?.message || 'Gagal membuat petugas');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleOfficerStatus = async (id: string, currentStatus: boolean) => {
     try {
       await api.put(`/admin/officers/${id}`, { is_active: !currentStatus });
       fetchOfficers();
     } catch (error: any) {
      console.error('Failed to fetch dropdown data:', error.response?.data || error.message || error);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'fullName',
      header: 'Nama Lengkap',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold border-2 border-white shadow-sm">
            {row.original.fullName.charAt(0)}
          </div>
          <div className="space-y-0.5">
            <p className="font-bold text-slate-900">{row.original.fullName}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{row.original.employeeCode}</p>
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
      accessorKey: 'assignedZone',
      header: 'Zona Tugas',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-slate-600 italic">
          <Map size={14} className="text-slate-400" />
          <span className="text-sm">{row.original.assignedZone || 'Belum diatur'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
          {row.original.isActive ? 'Aktif' : 'Non-aktif'}
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
            className="h-8 w-8 p-0 rounded-lg hover:border-slate-300"
            onClick={() => toggleOfficerStatus(row.original.id, row.original.isActive)}
            title={row.original.isActive ? 'Non-aktifkan' : 'Aktifkan'}
          >
            {row.original.isActive ? <UserMinus size={14} className="text-red-500" /> : <UserCheck size={14} className="text-green-500" />}
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg">
            <Edit size={14} />
          </Button>
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen User</h1>
          <p className="text-slate-500 text-sm">Kelola data petugas lapangan dan admin</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
        >
          <UserPlus size={18} className="mr-2" />
          Tambah Petugas
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Petugas</p>
            <p className="text-xl font-bold text-slate-900">{data.length}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or employee code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <Table columns={columns} data={data} loading={loading} />

      {/* Modal Tambah Petugas */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Tambah Petugas Baru"
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
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
              >
                <option value="">-- Pilih Ranting --</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branch_id && <p className="text-xs font-medium text-red-500">{errors.branch_id.message}</p>}
            </div>
          )}
          <Input 
            label="Zona Tugas (Opsional)" 
            placeholder="Misal: Ranting Kediri"
            {...register('assigned_zone')}
          />
          <Input 
            label="URL Foto Profil (Opsional)" 
            placeholder="https://..."
            error={errors.photo_url?.message}
            {...register('photo_url')}
          />
          
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
              onClick={() => setIsModalOpen(false)}
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              isLoading={submitting}
            >
              Simpan Petugas
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
