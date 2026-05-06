import React, { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Filter, FileSpreadsheet, TrendingUp, Wallet, Calendar, FileText } from 'lucide-react';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import ReportsClient from './ReportsClient';
import { Skeleton } from '@/components/ui/Skeleton';

async function getStatsData() {
  const cookieStore = await cookies();
  const token = cookieStore.get('lazisnu_token')?.value;

  if (!token) return null;

  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_URL}/v1/bendahara/reports/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60, tags: ['reports', 'stats'] }, // Cache for 60s
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.summary || null;
  } catch (error) {
    console.error('Stats fetch error:', error);
    return null;
  }
}

async function TransactionList() {
  const cookieStore = await cookies();
  const token = cookieStore.get('lazisnu_token')?.value;

  if (!token) return <ReportsClient data={[]} />;

  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_URL}/v1/bendahara/collections`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 30, tags: ['reports', 'transactions'] },
    });

    if (!res.ok) return <ReportsClient data={[]} />;
    const json = await res.json();
    return <ReportsClient data={json.data?.collections || []} />;
  } catch (error) {
    return <ReportsClient data={[]} />;
  }
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

import ExportButton from './ExportButton';

export default async function ReportsPage() {
  const stats = await getStatsData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="text-green-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Laporan Keuangan</h1>
            <p className="text-slate-500 text-sm font-medium">Rekapitulasi pengumpulan infaq harian dan bulanan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl h-11 px-5 text-sm font-bold border-slate-200 hover:bg-slate-50 transition-all active:scale-95 flex items-center gap-2">
            <Filter size={18} />
            Filter
          </Button>
          <ExportButton />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white border-none">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-green-100 uppercase tracking-wider">Perolehan Bulan Ini</p>
              <h3 className="text-2xl font-black mt-1">
                Rp {stats ? Number(stats.total_amount || stats.month_collection).toLocaleString('id-ID') : '0'}
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
                {stats ? (stats.total_count || stats.month_count) : '0'} Kali
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metode Pembayaran</p>
              <div className="mt-1 flex gap-4 text-sm font-bold text-slate-900">
                <span className="flex items-center gap-1 text-green-600">Tunai: {stats?.cash_count || 0}</span>
                <span className="flex items-center gap-1 text-blue-600">Transfer: {stats?.transfer_count || 0}</span>
              </div>
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
        <Suspense fallback={<TableSkeleton />}>
          <TransactionList />
        </Suspense>
      </div>
    </div>
  );
}
