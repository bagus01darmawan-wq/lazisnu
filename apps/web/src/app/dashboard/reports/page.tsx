'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { 
  FileText, 
  Download, 
  Filter, 
  Calendar,
  FileSpreadsheet,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useAuthStore } from '@/store/useAuthStore';

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const endpoint = user?.role === 'ADMIN_KECAMATAN' ? '/admin/district/dashboard' : '/admin/branch/dashboard';
      const response: any = await api.get(endpoint);
      if (response.success) {
        setData(response.data.recent_collections || []);
        setStats(response.data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'collected_at',
      header: 'Tanggal',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-slate-500">
          {format(new Date(row.original.collected_at), 'PPP', { locale: id })}
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
      header: 'Penyumbang',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.owner_name}</span>,
    },
    {
      accessorKey: 'officer_name',
      header: 'Petugas',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
             {row.original.officer_name.charAt(0)}
           </div>
           <span className="text-sm">{row.original.officer_name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal',
      cell: ({ row }) => (
        <span className="font-bold text-green-600">
          Rp {Number(row.original.nominal).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Laporan Keuangan</h1>
          <p className="text-slate-500 text-sm">Rekapitulasi pengumpulan infaq harian dan bulanan</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl">
            <Filter size={18} className="mr-2" />
            Filter
          </Button>
          <Button className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 rounded-xl">
            <Download size={18} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white border-none">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-green-100 uppercase tracking-wider">Perolehan Bulan Ini</p>
              <h3 className="text-2xl font-black mt-1">
                Rp {stats ? Number(stats.month_collection).toLocaleString('id-ID') : '0'}
              </h3>
            </div>
            <div className="p-2 bg-white/20 rounded-lg">
              <Wallet size={20} />
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Koleksi</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats ? stats.month_count : '0'} Kali
              </h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FileSpreadsheet size={20} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Kaleng</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats ? stats.total_cans : '0'}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Collections Table as a Report */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-green-600" />
            Transaksi Terakhir
          </h3>
        </div>
        <Table columns={columns} data={data} loading={loading} />
      </div>
    </div>
  );
}
