'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ResubmitFormValues>({
    resolver: zodResolver(resubmitSchema as any),
  });

  const fetchCollections = async (searchQuery = search, currentPage = page, limit = pageSize) => {
    setLoading(true);
    try {
      const response: any = await api.get('/bendahara/collections', {
        params: { page: currentPage, limit: limit, search: searchQuery },
      });
      if (response.success) {
        setData(response.data.collections || []);
        setTotalItems(response.data.pagination?.total || 0);
        setTotalPages(response.data.pagination?.total_pages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      void fetchCollections(search, 1, pageSize);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, pageSize]);

  const handleReset = () => {
    setSearch('');
    setPage(1);
    void fetchCollections('', 1, pageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    void fetchCollections(search, newPage, pageSize);
  };

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
      cell: ({ row }) => {
        const date = new Date(row.original.collected_at);
        return (
          <span className="text-xs font-medium text-[#F4F1EA]/60">
            {format(date, 'PPP HH:mm', { locale: id })}
          </span>
        );
      },
    },
    {
      accessorKey: 'qr_code',
      header: 'Kode Kaleng',
      cell: ({ row }) => <span className="text-[12px] font-bold text-[#F4F1EA]/40 tracking-tight">#{row.original.qr_code}</span>,
    },
    {
      accessorKey: 'owner_name',
      header: 'Donatur',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA]">{row.original.owner_name}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest">PEMBERI INFAQ</span>
        </div>
      ),
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal Aktual',
      cell: ({ row }) => (
        <span className="font-bold text-[#EAD19B]">
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
            className="h-8 gap-2 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 rounded-xl"
            onClick={() => {
              setSelectedCol(row.original);
              setIsModalOpen(true);
              reset({ nominal: row.original.nominal, alasan_resubmit: '' });
            }}
          >
            <RotateCcw size={14} className="text-[#EAD19B]" />
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
          <History className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Pelacakan & Koreksi</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Review data koleksi dan lakukan re-submit jika terjadi kesalahan input</p>
          </div>
        </div>
      </div>

      <div className="bg-[#EAD19B]/10 backdrop-blur-md border border-[#EAD19B]/20 p-5 rounded-2xl flex gap-4 items-center shadow-sm">
        <div className="w-12 h-12 bg-[#EAD19B] text-[#2C473E] rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-[#EAD19B]/20">
          <AlertCircle size={24} strokeWidth={2.5} />
        </div>
        <div className="text-sm">
          <p className="font-bold text-[#F4F1EA] uppercase tracking-wider text-[10px] mb-1 opacity-60">Prinsip Immutability</p>
          <p className="text-[#F4F1EA] font-medium leading-relaxed opacity-90">
            Data koleksi tidak bisa dihapus. Koreksi dilakukan dengan memasukkan data baru (Re-submit) yang akan memicu notifikasi WhatsApp baru ke donatur sebagai bukti transparansi.
          </p>
        </div>
      </div>

      {/* Transparent Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-transparent p-5 border-none shadow-none">
        <div className="relative w-[200px] group">
          <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
            <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
              <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
            </div>
            <input
              type="text"
              placeholder="Cari transaksi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-white/30 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
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
              setPage(1);
            }}
            className="min-w-[80px]! h-[36px]"
            popoverWidth="w-full"
            showSearch={false}
          />

          <button 
            onClick={handleReset}
            className="h-[36px] bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white hover:bg-white/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
          >
            <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
            RESET
          </button>
        </div>
      </div>

      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden w-full max-w-full transition-all duration-700">
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2 bg-white/5">
          <History size={18} strokeWidth={3} className="text-[#EAD19B]" />
          <h3 className="font-bold text-[#F4F1EA] tracking-tight">Daftar Transaksi Koleksi</h3>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <Table columns={columns} data={data} loading={loading} variant="glass" />
        </div>

        {/* Smart Pagination Control - Standardized */}
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
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Transaksi</span>
            </div>

            {/* Right: Smart Control Pill */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
              {/* Page Info Badge */}
              <div className="px-4 flex items-center gap-1.5 min-w-[140px] justify-center">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Halaman</span>
                <div className="w-6 h-6 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                  <span className="text-xs font-black text-[#EAD19B]">{page}</span>
                </div>
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
                <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                  <span className="text-xs font-black text-[#F4F1EA]">{totalPages}</span>
                </div>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
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
              <Button
                type="submit"
                className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
                isLoading={submitting}
              >
                Konfirmasi Koreksi
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
