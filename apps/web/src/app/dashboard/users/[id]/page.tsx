'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { ProfileCard } from './ProfileCard';
import { StatsCards } from './StatsCards';
import { DonorList } from './DonorList';
import { MonthlyChart } from './MonthlyChart';
import { ConfirmToast } from '@/components/ui/ConfirmToast';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Edit, UserX, UserCheck, CalendarDays, ArrowUp, ArrowDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ApiResponse } from '@lazisnu/shared-types';

const officerSchema = z.object({
  full_name: z.string().min(1, 'Nama lengkap wajib diisi'),
  phone: z.string().min(10, 'Nomor HP minimal 10 digit'),
});

type OfficerFormValues = z.infer<typeof officerSchema>;

interface OfficerDetail {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string;
  photo_url?: string;
  assigned_zone?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  branch?: { id: string; name: string; code: string } | null;
  district?: { id: string; name: string; code: string } | null;
  stats: {
    total_collections: number;
    total_amount: number;
    total_assignments: number;
    completed_assignments: number;
    active_assignments: number;
    uncollected_assignments: number;
    completion_rate: number;
    average_per_collection: number;
    monthly_breakdown: { month: number; year: number; count: number; amount: number }[];
    top_donors: { owner_name: string; total: number }[];
    bottom_donors: { owner_name: string; total: number }[];
  };
}

export default function OfficerDetailPage({ params }: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const router = useRouter();
  const officerId = React.use(params as Promise<{ id: string }>).id;

  const [officer, setOfficer] = useState<OfficerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OfficerFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(officerSchema as any),
  });

  const fetchOfficer = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { year: selectedYear.toString() };
      if (selectedMonths.length > 0) {
        params.months = selectedMonths.join(',');
      }
      const response = await api.get(`/admin/officers/${officerId}`, { params }) as unknown as ApiResponse<OfficerDetail>;
      if (response.success && response.data) {
        setOfficer(response.data);
      } else {
        setError(response.error?.message || 'Gagal memuat data petugas');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOfficer();
  }, [officerId, selectedYear, selectedMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (officer) {
      reset({
        full_name: officer.full_name,
        phone: officer.phone,
      });
    }
  }, [officer, reset]);

  const handlePeriodChange = useCallback((months: number[], year: number) => {
    setSelectedMonths(months);
    setSelectedYear(year);
  }, []);

  const handleEdit = async (data: OfficerFormValues) => {
    if (!officer) return;
    setSubmitting(true);
    try {
      const response = await api.put(`/admin/officers/${officer.id}`, data) as unknown as ApiResponse<OfficerDetail>;
      if (response.success) {
        toast.success('Data petugas berhasil diperbarui');
        setIsEditModalOpen(false);
        await fetchOfficer();
      } else {
        toast.error(response.error?.message || 'Gagal memperbarui data');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!officer) return;
    const nextActive = !officer.is_active;
    const title = nextActive ? 'Aktifkan Petugas' : 'Nonaktifkan Petugas';
    const description = nextActive
      ? `Yakin ingin mengaktifkan kembali ${officer.full_name}?`
      : `Yakin ingin menonaktifkan ${officer.full_name}? Petugas tidak bisa login setelah dinonaktifkan.`;

    toast.custom((t) => (
      <ConfirmToast
        id={t}
        title={title}
        description={description}
        confirmLabel={nextActive ? 'Aktifkan' : 'Nonaktifkan'}
        cancelLabel="Batal"
        variant={nextActive ? 'info' : 'warning'}
        onConfirm={async () => {
          try {
            const response = await api.put(`/admin/officers/${officer.id}`, { is_active: nextActive }) as unknown as ApiResponse<OfficerDetail>;
            if (response.success) {
              toast.success(nextActive ? 'Petugas diaktifkan kembali' : 'Petugas dinonaktifkan');
              await fetchOfficer();
            } else {
              toast.error(response.error?.message || 'Gagal mengubah status');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
            toast.error(message);
          }
        }}
      />
    ));
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-6 w-48 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="h-48 rounded-2xl bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !officer) {
    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <Button variant="outline" onClick={() => router.push('/dashboard/users')} className="gap-2">
          <ArrowLeft size={16} /> Kembali
        </Button>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-lg font-bold text-[#F4F1EA]">{error || 'Petugas tidak ditemukan'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/users')}
            className="h-9 w-9 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/70 hover:text-[#F4F1EA] hover:bg-white/10"
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-[#F4F1EA] tracking-tight">Detail Petugas</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Profil dan performa kerja petugas</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsEditModalOpen(true)}
            className="gap-2 border-white/10 bg-white/5 text-[#F4F1EA]/80 hover:text-[#F4F1EA] hover:bg-white/10"
          >
            <Edit size={16} className="text-[#EAD19B]" />
            Edit
          </Button>
          <Button
            variant={officer.is_active ? 'danger' : 'primary'}
            onClick={handleToggleActive}
            className="gap-2"
          >
            {officer.is_active ? (
              <><UserX size={16} /> Nonaktifkan</>
            ) : (
              <><UserCheck size={16} /> Aktifkan</>
            )}
          </Button>
        </div>
      </div>

      {/* Profile */}
      <ProfileCard officer={officer} />

      {/* Period Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-sm font-black text-[#F4F1EA] uppercase tracking-widest flex items-center gap-2">
          <CalendarDays size={16} className="text-[#EAD19B]" />
          Periode Laporan
        </h2>
        <PeriodPicker
          months={selectedMonths.length > 0 ? selectedMonths : [new Date().getMonth() + 1]}
          year={selectedYear}
          onChange={handlePeriodChange}
        />
      </div>

      {/* Stats */}
      <StatsCards stats={officer.stats} />

      {/* Donor Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DonorList
          title="10 Donasi Terbanyak"
          donors={officer.stats.top_donors}
          icon={ArrowUp}
          color="text-[#1F8243]"
          bg="bg-[#1F8243]/10"
        />
        <DonorList
          title="10 Donasi Terkecil"
          donors={officer.stats.bottom_donors}
          icon={ArrowDown}
          color="text-[#DE6F4A]"
          bg="bg-[#DE6F4A]/10"
        />
      </div>

      {/* Chart */}
      <MonthlyChart data={officer.stats.monthly_breakdown} />

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Data Petugas"
        variant="glass"
        footer={(
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              className="border-white/10 bg-white/5 text-[#F4F1EA]/70 hover:text-[#F4F1EA]"
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmit(handleEdit)}
              isLoading={submitting}
              className="bg-[#EAD19B] text-[#2C473E] hover:bg-[#EAD19B]/90"
            >
              Simpan
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[#F4F1EA]/60 uppercase tracking-wider mb-2">Nama Lengkap</label>
            <Input
              {...register('full_name')}
              placeholder="Nama lengkap petugas"
              className="bg-white/5 border-white/10 text-[#F4F1EA] placeholder-[#F4F1EA]/30"
            />
            {errors.full_name && (
              <p className="text-[10px] text-[#DE6F4A] mt-1">{errors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#F4F1EA]/60 uppercase tracking-wider mb-2">Nomor HP</label>
            <Input
              {...register('phone')}
              placeholder="Nomor HP"
              className="bg-white/5 border-white/10 text-[#F4F1EA] placeholder-[#F4F1EA]/30"
            />
            {errors.phone && (
              <p className="text-[10px] text-[#DE6F4A] mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#F4F1EA]/60 uppercase tracking-wider mb-2">Ranting</label>
            <select
              value={officer.branch?.id || ''}
              disabled
              className="w-full h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-[#F4F1EA]/60 text-sm"
            >
              <option value="">{officer.branch?.name || 'Belum diatur'}</option>
            </select>
            <p className="text-[10px] text-[#F4F1EA]/40 mt-1">Ranting tidak dapat diubah dari halaman ini.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
