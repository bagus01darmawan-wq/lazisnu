'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { authHelper } from '@/lib/auth';

/**
 * Ekspor CSV mengikuti periode laporan yang sedang tampil (periode assignment),
 * bukan rentang 30 hari terakhir yang tidak berhubungan dengan filter.
 */
export default function ExportButton({
  year,
  month,
  months,
  periodLabel,
}: {
  year: string;
  month: string;
  months: string;
  periodLabel: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const token = authHelper.getToken();
      if (!token) {
        toast.error('Sesi berakhir, silakan login kembali');
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
      const params = new URLSearchParams({ year });
      if (months) params.set('months', months);
      else if (month) params.set('month', month);

      const res = await fetch(`${API_URL}/v1/bendahara/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Gagal mengunduh laporan');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-lazisnu-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Laporan ${periodLabel} berhasil diunduh`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengunduh laporan CSV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
    >
      <Download size={14} strokeWidth={3} />
      {loading ? 'Menyiapkan...' : 'Ekspor CSV'}
    </button>
  );
}
