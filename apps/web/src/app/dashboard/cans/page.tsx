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
  MoreVertical,
  MapPin,
  Phone,
  User as UserIcon,
  Filter
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const canSchema = z.object({
  owner_name: z.string().min(1, 'Nama pemilik wajib diisi'),
  owner_phone: z.string().min(10, 'Nomor HP minimal 10 digit'),
  owner_address: z.string().min(1, 'Alamat wajib diisi'),
  owner_whatsapp: z.string().optional(),
  location_notes: z.string().optional(),
  branch_id: z.string().min(1, 'Pilih ranting').optional(),
});

type CanFormValues = z.infer<typeof canSchema>;

export default function CansPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<{code: string, url: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState([]);
  const { user } = useAuthStore();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CanFormValues>({
    resolver: zodResolver(canSchema),
  });

  const fetchBranches = async () => {
    try {
      const response: any = await api.get('/admin/branches');
      if (response.success) setBranches(response.data);
    } catch (err) {}
  };

  const fetchCans = async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/cans', { params: { search } });
      if (response.success) {
        setData(response.data.items || []);
      }
    } catch (error: any) {
      console.error('Fetch Cans Error:', error);
      const errorMessage = error?.error?.message || error?.message || 'Gagal mengambil data kaleng';
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCans();
  }, [search]);

  useEffect(() => {
    if (user?.role === 'ADMIN_KECAMATAN') fetchBranches();
  }, [user]);

  const onSubmit = async (values: CanFormValues) => {
    setSubmitting(true);
    try {
      const response: any = await api.post('/admin/cans', values);
      if (response.success) {
        reset();
        setIsModalOpen(false);
        fetchCans();
      }
    } catch (error: any) {
      console.error('Failed to create can:', error.response?.data || error.message || error);
      alert(error.response?.data?.error?.message || 'Gagal membuat kaleng');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateQr = async (id: string) => {
    try {
      const response: any = await api.post(`/admin/cans/${id}/generate-qr`);
      if (response.success) {
        setSelectedQr({
          code: response.data.qr_code,
          url: response.data.qr_image_url
        });
        setIsQrModalOpen(true);
      }
    } catch (error: any) {
      console.error('Failed to fetch dropdown data:', error.response?.data || error.message || error);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'qrCode',
      header: 'Kode QR',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            <QrCode size={16} />
          </div>
          <span className="font-bold text-slate-800 tracking-tight">{row.original.qrCode}</span>
        </div>
      ),
    },
    {
      accessorKey: 'ownerName',
      header: 'Pemilik',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-bold text-slate-900">{row.original.ownerName}</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
             <Phone size={12} />
             <span>{row.original.ownerPhone}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'ownerAddress',
      header: 'Alamat',
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate group relative">
          <div className="flex items-center gap-1.5 text-slate-600">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            <span className="truncate">{row.original.ownerAddress}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 ml-5 italic">
            {row.original.locationNotes || 'Tidak ada catatan'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'totalCollected',
      header: 'Total Terkumpul',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-bold text-green-600">
            Rp {Number(row.original.totalCollected).toLocaleString('id-ID')}
          </p>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
            {row.original.collectionCount} Kali Ambil
          </p>
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
            className="h-8 w-8 p-0 rounded-lg hover:border-green-300 hover:text-green-600"
            onClick={() => handleGenerateQr(row.original.id)}
          >
            <QrCode size={14} />
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kelola Kaleng</h1>
          <p className="text-slate-500 text-sm">Manajemen data kaleng infaq dan pemilik</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
        >
          <Plus size={18} className="mr-2" />
          Tambah Kaleng
        </Button>
      </div>

      {/* Stats Overview Sederhana */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Box size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total Kaleng</p>
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
            placeholder="Cari nama pemilik atau kode QR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button variant="outline" size="sm" className="rounded-xl flex-1 md:flex-none">
            <Filter size={16} className="mr-2" />
            Filter
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Table columns={columns} data={data} loading={loading} />

      {/* Modal Tambah Kaleng */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Tambah Kaleng Baru"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input 
            label="Nama Pemilik" 
            placeholder="Masukkan nama lengkap"
            error={errors.owner_name?.message}
            {...register('owner_name')}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="Nomor Handphone" 
              placeholder="0812..."
              error={errors.owner_phone?.message}
              {...register('owner_phone')}
            />
            <Input 
              label="Nomor WhatsApp (Opsional)" 
              placeholder="0812..."
              {...register('owner_whatsapp')}
            />
          </div>
          <Input 
            label="Alamat Lengkap" 
            placeholder="Nama jalan, RT/RW..."
            error={errors.owner_address?.message}
            {...register('owner_address')}
          />
          <Input 
            label="Catatan Lokasi (Opsional)" 
            placeholder="Misal: Dekat gapura merah"
            {...register('location_notes')}
          />
          
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
              Simpan Data
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal QR Code */}
      <Modal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        title="Kode QR Kaleng"
      >
        {selectedQr && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 shadow-inner mb-6">
              <img src={selectedQr.url} alt="QR Code" className="w-64 h-64" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">{selectedQr.code}</h3>
            <p className="text-slate-500 text-sm mb-8 px-8">
              Gunakan kode ini untuk discan oleh petugas saat pengambilan infaq.
            </p>
            <div className="flex gap-4 w-full">
               <Button className="flex-1" onClick={() => window.print()}>
                 Cetak QR
               </Button>
               <Button variant="outline" className="flex-1" onClick={() => setIsQrModalOpen(false)}>
                 Tutup
               </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
