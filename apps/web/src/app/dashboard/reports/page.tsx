import React, { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Filter, FileSpreadsheet, TrendingUp, Wallet, Calendar, FileText } from 'lucide-react';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import ReportsClient from './ReportsClient';
import { Skeleton } from '@/components/ui/Skeleton';
import FilterDropdown from './FilterDropdown';
import ExportButton from './ExportButton';

async function getStatsData(month: string, year: string, branch: string, officer: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('lazisnu_token')?.value;

  if (!token) return null;

  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const url = new URL(`${API_URL}/v1/bendahara/reports/summary`);
    url.searchParams.append('month', month);
    url.searchParams.append('year', year);
    if (branch) url.searchParams.append('branch_id', branch);
    if (officer) url.searchParams.append('officer_id', officer);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.summary || null;
  } catch (error) {
    console.error('Stats fetch error:', error);
    return null;
  }
}

async function TransactionList({ month, year, branch, officer, search, page, limit }: { month: string, year: string, branch: string, officer: string, search: string, page: string, limit: string }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('lazisnu_token')?.value;

  if (!token) return <ReportsClient data={[]} />;

  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString();
    const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999).toISOString();

    const url = new URL(`${API_URL}/v1/bendahara/collections`);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('limit', limit);
    url.searchParams.append('page', page);
    if (branch) url.searchParams.append('branch_id', branch);
    if (officer) url.searchParams.append('officer_id', officer);
    if (search) url.searchParams.append('search', search);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return <ReportsClient data={[]} pagination={{ page: 1, limit: parseInt(limit), total: 0, total_pages: 0 }} />;
    const json = await res.json();
    return <ReportsClient data={json.data?.collections || []} pagination={json.data?.pagination} />;
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

export default async function ReportsPage(props: { searchParams: Promise<{ month?: string; year?: string; branch?: string; officer?: string; search?: string; page?: string; limit?: string }> }) {
  const searchParams = await props.searchParams;
  const month = searchParams.month || (new Date().getMonth() + 1).toString();
  const year = searchParams.year || new Date().getFullYear().toString();
  const branch = searchParams.branch || '';
  const officer = searchParams.officer || '';
  const search = searchParams.search || '';
  const page = searchParams.page || '1';
  const limit = searchParams.limit || '10';

  const stats = await getStatsData(month, year, branch, officer);

  // Calculate Average Per Can
  const totalAmount = Number(stats?.total_amount || 0);
  const totalCount = Number(stats?.total_count || 0);
  const averagePerCan = totalCount > 0 ? totalAmount / totalCount : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Laporan Keuangan</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Rekapitulasi perolehan infaq dan mutasi dana</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Perolehan Total</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">
                Rp {totalAmount.toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
              Total Penarikan
            </span>
            <span className="text-xs text-green-600 font-bold">{totalCount} Kali</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rata-Rata Per Kaleng</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">
                Rp {Math.round(averagePerCan).toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
              <FileSpreadsheet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
              Nilai Efisiensi
            </span>
            <span className="text-xs text-slate-500 font-medium">Bulan Ini</span>
          </div>
        </Card>
      </div>

      {/* Toolbar Section (Search & Filter) */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <FilterDropdown />
      </div>

      {/* Recent Collections Table as a Report */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#F4F1EA] flex items-center gap-2">
            <Calendar size={18} className="text-[#EAD19B]" />
            Transaksi Terakhir
          </h3>
        </div>
        <Suspense fallback={<TableSkeleton />}>
          <TransactionList month={month} year={year} branch={branch} officer={officer} search={search} page={page} limit={limit} />
        </Suspense>
      </div>
    </div>
  );
}
