'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { authHelper } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

export default function ExportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleExport = async () => {
    if (!startDate || !endDate) {
      toast.error('Silakan pilih rentang tanggal');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Tanggal mulai tidak boleh lebih besar dari tanggal selesai');
      return;
    }

    setLoading(true);
    try {
      const token = authHelper.getToken();
      if (!token) {
        toast.error('Sesi berakhir, silakan login kembali');
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/v1/bendahara/export?start_date=${startDate}&end_date=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Gagal mengunduh laporan');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-lazisnu-${startDate}-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Laporan berhasil diunduh');
      setIsOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengunduh laporan CSV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
      >
        <Download size={14} strokeWidth={3} />
        Ekspor CSV
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Export Laporan CSV"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button 
              onClick={handleExport} 
              isLoading={loading}
              className="bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold px-6 rounded-xl"
            >
              Download CSV
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500 mb-4">
            Pilih rentang tanggal penjemputan infaq yang ingin diunduh dalam format CSV.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Tanggal Mulai</label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Tanggal Selesai</label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
