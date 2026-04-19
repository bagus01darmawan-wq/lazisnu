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
  Send, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  Search
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function WAMonitorPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sent: 0,
    pending: 0,
    failed: 0
  });

  const fetchWAStatus = async () => {
    setLoading(true);
    try {
      // Mocking for now as there's no dedicated global notifications endpoint for admins yet
      // In a real scenario, this would fetch from /admin/notifications
      const response: any = await api.get('/admin/audit-logs', { params: { limit: 20 } });
      if (response.success) {
        // Transform audit logs into a notification-like view for demo
        setData(response.data.logs.map((log: any) => ({
          id: log.id,
          recipient: log.user?.fullName || 'Donatur',
          message: `Notifikasi ${log.actionType} pada ${log.entityType}`,
          status: 'SENT',
          time: log.createdAt
        })));
        setStats({ sent: 142, pending: 3, failed: 1 });
      }
    } catch (error) {
      console.error('Failed to fetch WA status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWAStatus();
  }, []);

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'time',
      header: 'Waktu',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-slate-500">
          {format(new Date(row.original.time), 'HH:mm:ss, PPP', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'recipient',
      header: 'Penerima',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900">{row.original.recipient}</span>
          <span className="text-[10px] text-slate-400">0812-xxxx-xxxx</span>
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">WhatsApp Monitor</h1>
          <p className="text-slate-500 text-sm">Status pengiriman notifikasi otomatis kepada donatur</p>
        </div>
        <Button variant="outline" onClick={fetchWAStatus} className="rounded-xl gap-2">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh Status
        </Button>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-green-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
              <Send size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Berhasil Terkirim</p>
              <p className="text-2xl font-black text-slate-900">{stats.sent}</p>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-50 text-yellow-600 rounded-2xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dalam Antrean</p>
              <p className="text-2xl font-black text-slate-900">{stats.pending}</p>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <XCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gagal Terkirim</p>
              <p className="text-2xl font-black text-slate-900">{stats.failed}</p>
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
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
             <input 
               type="text" 
               placeholder="Cari nomor/nama..." 
               className="pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-green-500/20"
             />
           </div>
        </div>
        <Table columns={columns} data={data} loading={loading} />
      </div>
    </div>
  );
}
