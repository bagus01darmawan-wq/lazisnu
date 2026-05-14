'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import {
  MessageSquare,
  Search,
  Send,
  Clock,
  XCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'sonner';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { cn } from '@/lib/utils';

export default function WAMonitorPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sent: 0,
    pending: 0,
    failed: 0
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchWAStatus = async (currentPage = page, searchQuery = search, limit = pageSize) => {
    setLoading(true);
    try {
      const response: any = await api.get('/admin/wa/logs', {
        params: { page: currentPage, limit: limit, search: searchQuery }
      });
      if (response.success) {
        const items = response.data.logs || [];
        setData(items.map((notif: any) => ({
          id: notif.id,
          recipient: notif.recipientName || 'Donatur',
          phone: notif.recipientPhone,
          message: notif.messageContent,
          status: notif.status,
          time: notif.createdAt
        })));
        setTotalItems(response.data.pagination?.total || 0);
        setTotalPages(response.data.pagination?.total_pages || 1);
        if (response.data.stats) {
          setStats(response.data.stats);
        }
      }
    } catch (error) {
      console.error('Failed to fetch WA status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      void fetchWAStatus(1, search, pageSize);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, pageSize]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    void fetchWAStatus(newPage, search, pageSize);
  };

  const handleReset = () => {
    setSearch('');
    setPage(1);
    void fetchWAStatus(1, '', pageSize);
  };



  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'time',
      header: 'Waktu',
      cell: ({ row }) => {
        const date = new Date(row.original.time);
        return (
          <span className="text-xs font-medium text-[#F4F1EA]/60">
            {isValid(date) ? format(date, 'HH:mm:ss, PPP', { locale: id }) : '-'}
          </span>
        );
      },
    },
    {
      accessorKey: 'recipient',
      header: 'Penerima',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA]">{row.original.recipient}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'message',
      header: 'Pesan',
      cell: ({ row }) => <span className="text-xs text-[#F4F1EA]/60 line-clamp-1">{row.original.message}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        let statusColor = "text-[#F4F1EA]/40";
        if (row.original.status === 'SENT') statusColor = "text-[#1F8243]";
        if (row.original.status === 'FAILED') statusColor = "text-[#D97A76]";
        
        return (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${statusColor}`}>
            {row.original.status}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">WhatsApp Monitor</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Pantau status pengiriman notifikasi donatur secara real-time.</p>
          </div>
        </div>

        {/* Primary Action Button */}
        <Button
          onClick={() => fetchWAStatus(page, search, pageSize)}
          className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
        >
          <RefreshCw size={14} strokeWidth={3} className={cn(loading && "animate-spin")} />
          Refresh Status
        </Button>
      </div>

      {/* Queue Stats Cards - Glassmorphism style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#1F8243]/10 text-[#1F8243] rounded-2xl group-hover:bg-[#1F8243] group-hover:text-white transition-all duration-500 shadow-lg">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Terkirim</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.sent}</h3>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#EAD19B]/10 text-[#EAD19B] rounded-2xl group-hover:bg-[#EAD19B] group-hover:text-[#2C473E] transition-all duration-500 shadow-lg">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Dalam Antrean</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.pending}</h3>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#DE6F4A]/10 text-[#DE6F4A] rounded-2xl group-hover:bg-[#DE6F4A] group-hover:text-white transition-all duration-500 shadow-lg">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Gagal</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.failed}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Log Table Toolbar - Reorganized */}
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
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
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
          <MessageSquare size={18} strokeWidth={3} className="text-[#EAD19B]" />
          <h3 className="font-bold text-[#F4F1EA] tracking-tight">Log Notifikasi</h3>
        </div>
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
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Notifikasi</span>
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

      {/* Failed Jobs (DLQ) Management - Premium Glassmorphism */}
      <div className="bg-[#DE6F4A]/10 backdrop-blur-md p-6 rounded-3xl border border-[#DE6F4A]/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#DE6F4A]/20 text-[#F4F1EA] rounded-2xl shadow-lg">
            <XCircle size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#F4F1EA] tracking-tight">Antrean Gagal (DLQ)</h3>
            <p className="text-xs text-[#F4F1EA]/60 font-medium max-w-md mt-0.5">
              Pesan yang gagal dikirim setelah beberapa kali percobaan akan masuk ke sini untuk diproses ulang atau dihapus.
            </p>
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              const response: any = await api.post('/admin/wa/flush-failed');
              if (response.success) {
                toast.success('Antrean berhasil dibersihkan');
                void fetchWAStatus();
              }
            } catch (e) {
              toast.error('Gagal membersihkan antrean');
            }
          }}
          className="px-6 py-2.5 bg-[#DE6F4A] text-white text-xs font-bold rounded-2xl hover:bg-[#DE6F4A]/90 transition-all active:scale-95 shadow-lg shadow-[#DE6F4A]/30 flex items-center gap-2 border border-white/10"
        >
          <Trash2 size={16} />
          Bersihkan Semua Gagal
        </button>
      </div>
    </div>
  );
}
