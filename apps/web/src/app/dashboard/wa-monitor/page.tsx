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
  Trash2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

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



  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'time',
      header: 'Waktu',
      cell: ({ row }) => {
        const date = new Date(row.original.time);
        return (
          <span className="text-xs font-medium text-slate-500">
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
          <span className="font-bold text-slate-900">{row.original.recipient}</span>
          <span className="text-[10px] text-slate-400">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'message',
      header: 'Pesan',
      cell: ({ row }) => <span className="text-xs text-slate-600 line-clamp-1">{row.original.message}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'SENT' ? 'sent' : 'pending'}>
          {row.original.status === 'SENT' && <CheckCircle2 size={12} className="mr-1" />}
          {row.original.status}
        </Badge>
      ),
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
        <div className="flex gap-2">

          <Button 
            variant="outline" 
            onClick={() => fetchWAStatus(page, search, pageSize)} 
            className="rounded-xl h-11 px-5 text-sm font-bold border-[#EAD19B] text-[#EAD19B] hover:bg-[#EAD19B]/10 transition-all active:scale-95 flex items-center gap-2"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#F4F1EA] border-none shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#1F8243]/10 text-[#1F8243] rounded-xl">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-[#2C473E]/50 uppercase tracking-wider">Terkirim</p>
              <p className="text-2xl font-black text-[#2C473E]">{stats.sent}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#F4F1EA] border-none shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-[#2C473E]/50 uppercase tracking-wider">Dalam Antrean</p>
              <p className="text-2xl font-black text-[#2C473E]">{stats.pending}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#F4F1EA] border-none shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#DE6F4A]/10 text-[#DE6F4A] rounded-xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-[#2C473E]/50 uppercase tracking-wider">Gagal</p>
              <p className="text-2xl font-black text-[#2C473E]">{stats.failed}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Log Table */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <MessageSquare size={18} className="text-green-600" />
             Log Real-time Notifikasi
           </h3>
           <div className="relative flex-1 max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2C473E]/40" size={14} />
             <input 
               type="text" 
               placeholder="Cari donatur atau nomor..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full pl-8 pr-4 py-2 bg-[#F4F1EA] border border-[#2C473E]/10 rounded-xl text-xs text-[#2C473E] outline-none focus:ring-4 focus:ring-[#1F8243]/10 focus:border-[#1F8243] transition-all shadow-sm"
             />
           </div>
        </div>
        <div className="overflow-hidden">
          <Table columns={columns} data={data} loading={loading} />
          
          {/* Pagination Controls (Cans-style) */}
          {!loading && totalItems > 0 && (
             <div className="px-6 py-6 bg-[#F4F1EA]/50 border-t border-[#2C473E]/5 flex flex-col items-end gap-3 mt-4 -mx-4 -mb-4">
               <p className="text-xs font-medium text-[#2C473E]/60">
                 Menampilkan <span className="font-bold text-[#2C473E]">{data.length}</span> dari <span className="font-bold text-[#2C473E]">{totalItems}</span> notifikasi
               </p>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    Halaman <span className="text-green-600">{page}</span> dari {totalPages}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => handlePageChange(page - 1)}
                      className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => handlePageChange(page + 1)}
                      className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                    >
                      Selanjutnya
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Failed Jobs (DLQ) Management */}
      <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
           <h3 className="font-bold text-red-800 flex items-center gap-2">
             <XCircle size={18} className="text-red-600" />
             Failed Messages (DLQ)
           </h3>
           <Button variant="outline" onClick={async () => {
              try {
                const response: any = await api.post('/admin/wa/flush-failed');
                if (response.success) {
                  toast.success('Antrean berhasil dibersihkan');
                  void fetchWAStatus();
                }
              } catch (e) {
                toast.error('Gagal membersihkan antrean');
              }
            }}>
              Clear All Failed
            </Button>
        </div>
        <div className="text-sm text-slate-500 mb-4">
          Pesan yang gagal dikirim setelah beberapa kali percobaan akan masuk ke sini.
        </div>
      </div>
    </div>
  );
}
