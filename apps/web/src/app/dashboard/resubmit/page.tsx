'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'react-hot-toast';
import { 
  History, 
  RotateCcw, 
  Search, 
  AlertCircle,
  Clock,
  CheckCircle2,
  User as UserIcon
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const resubmitSchema = z.object({
  nominal: z.number().positive('Nominal harus positif'),
  alasan_resubmit: z.string().min(5, 'Alasan minimal 5 karakter'),
});

type ResubmitFormValues = z.infer<typeof resubmitSchema>;

export default function ResubmitPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCol, setSelectedCol] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ResubmitFormValues>({
    resolver: zodResolver(resubmitSchema as any),
  });

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const endpoint = user?.role === 'ADMIN_KECAMATAN' ? '/admin/district/dashboard' : '/admin/branch/dashboard';
      const response: any = await api.get(endpoint);
      if (response.success) {
        setData(response.data.recent_collections || []);
      }
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCollections();
  }, []);

  const onSubmit = async (values: ResubmitFormValues) => {
    if (!selectedCol) return;
    setSubmitting(true);
    try {
      const response: any = await api.post(`/admin/collections/${selectedCol.id}/resubmit`, values);
      if (response.success) {
        reset();
        setIsModalOpen(false);
        void fetchCollections();
        toast.success('Data berhasil di-koreksi dan di-submit ulang');
      }
    } catch (error: any) {
      toast.error(error.error?.message || 'Gagal melakukan re-submit');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'collected_at',
      header: 'Waktu Ambil',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-slate-500">
          {format(new Date(row.original.collected_at), 'PPP HH:mm', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'qr_code',
      header: 'Kode Kaleng',
      cell: ({ row }) => <span className="font-bold text-slate-900">{row.original.qr_code}</span>,
    },
    {
      accessorKey: 'owner_name',
      header: 'Donatur',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.owner_name}</span>,
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal Aktual',
      cell: ({ row }) => (
        <span className="font-bold text-slate-700">
          Rp {Number(row.original.nominal).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-lg gap-2 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-200"
            onClick={() => {
              setSelectedCol(row.original);
              setIsModalOpen(true);
              reset({ nominal: row.original.nominal, alasan_resubmit: '' });
            }}
          >
            <RotateCcw size={14} />
            Koreksi
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="text-green-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pelacakan & Koreksi</h1>
            <p className="text-slate-500 text-sm font-medium">Review data koleksi dan lakukan re-submit jika terjadi kesalahan input</p>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex gap-4 items-center">
         <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0">
           <AlertCircle size={24} />
         </div>
         <div className="text-sm text-amber-900">
            <p className="font-bold">Prinsip Immutability</p>
            <p className="opacity-80">Data koleksi tidak bisa dihapus. Koreksi dilakukan dengan memasukkan data baru (Re-submit) yang akan memicu notifikasi WhatsApp baru ke donatur sebagai bukti transparansi.</p>
         </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cari transaksi (ID, Kaleng, Penyerah)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>
      </div>

      <Table columns={columns} data={data} loading={loading} />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Formulir Koreksi (Re-submit)"
      >
        {selectedCol && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
               <div className="flex justify-between text-xs font-bold uppercase text-slate-400 tracking-wider">
                 <span>Transaksi Original</span>
                 <span>ID: {selectedCol.id.substring(0, 8)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-sm font-medium text-slate-700">{selectedCol.owner_name}</span>
                 <span className="text-sm font-black text-slate-900">Rp {Number(selectedCol.nominal).toLocaleString('id-ID')}</span>
               </div>
            </div>

            <div className="space-y-4">
              <Input 
                label="Nominal Baru (Benar)" 
                type="number"
                placeholder="Masukkan nominal koreksi"
                error={errors.nominal?.message}
                {...register('nominal', { valueAsNumber: true })}
              />
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Alasan Koreksi</label>
                <textarea 
                  {...register('alasan_resubmit')}
                  className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
                  placeholder="Jelaskan alasan koreksi data ini..."
                />
                {errors.alasan_resubmit && <p className="text-xs font-medium text-red-500">{errors.alasan_resubmit.message}</p>}
              </div>
            </div>

            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-[11px] text-red-700">
               <strong>PERHATIAN:</strong> Re-submit akan mengirimkan notifikasi WhatsApp baru ke donatur dengan nominal yang baru. Tindakan ini tercatat dalam audit log.
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="flex-1" isLoading={submitting}>
                Konfirmasi Koreksi
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
