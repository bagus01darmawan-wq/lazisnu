'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authHelper } from '@/lib/auth';

export default function ExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const token = authHelper.getToken();
      if (!token) {
        toast.error('Sesi berakhir, silakan login kembali');
        return;
      }

      // Default to last 30 days if no filter selected (simple implementation)
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/v1/bendahara/export?start_date=${start}&end_date=${end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Gagal mengunduh laporan');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-lazisnu-${start}-${end}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Laporan berhasil diunduh');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengunduh laporan CSV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleExport}
      isLoading={loading}
      className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 px-6 h-11 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
    >
      <Download size={20} />
      Export CSV
    </Button>
  );
}
