import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Filter, FileSpreadsheet, TrendingUp, Wallet, Calendar } from 'lucide-react';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import ReportsClient from './ReportsClient';

async function getReportData() {
  const cookieStore = await cookies();
  const token = cookieStore.get('lazisnu_token')?.value;

  if (!token) return { data: [], stats: null };

  try {
    const payload = decodeJwt(token);
    const role = payload.role as string;
    const endpoint = role === 'ADMIN_KECAMATAN' ? '/admin/district/dashboard' : '/admin/branch/dashboard';
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_URL}/v1${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return { data: [], stats: null };

    const json = await res.json();
    return {
      data: json.data?.recent_collections || [],
      stats: json.data?.summary || null,
    };
  } catch (error) {
    console.error('Server fetch error:', error);
    return { data: [], stats: null };
  }
}

export default async function ReportsPage() {
  const { data, stats } = await getReportData();

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
        <ReportsClient data={data} />
      </div>
    </div>
  );
}
