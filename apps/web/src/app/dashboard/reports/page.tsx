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
        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="bg-white/[0.03] -m-6 p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Perolehan Total</p>
                <h3 className="text-2xl font-black text-[#F4F1EA] mt-1.5 tracking-tight">
                  Rp {totalAmount.toLocaleString('id-ID')}
                </h3>
              </div>
              <div className="p-3 bg-[#EAD19B]/10 text-[#EAD19B] rounded-2xl group-hover:bg-[#EAD19B] group-hover:text-[#2C473E] transition-all duration-500 shadow-lg">
                <Wallet size={20} />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex items-center text-[10px] font-black text-[#F4F1EA]/40 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5 uppercase tracking-wider">
                Total Penarikan
              </span>
              <span className="text-xs text-[#EAD19B] font-bold">{totalCount} Kali</span>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="bg-white/[0.03] -m-6 p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Rata-Rata Per Kaleng</p>
                <h3 className="text-2xl font-black text-[#F4F1EA] mt-1.5 tracking-tight">
                  Rp {Math.round(averagePerCan).toLocaleString('id-ID')}
                </h3>
              </div>
              <div className="p-3 bg-[#6B9E9F]/10 text-[#6B9E9F] rounded-2xl group-hover:bg-[#6B9E9F] group-hover:text-[#2C473E] transition-all duration-500 shadow-lg">
                <FileSpreadsheet size={20} />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex items-center text-[10px] font-black text-[#F4F1EA]/40 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5 uppercase tracking-wider">
                Nilai Efisiensi
              </span>
              <span className="text-xs text-[#6B9E9F] font-bold">Bulan Ini</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Transparent Toolbar Section */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-start w-full bg-transparent p-4 border-none shadow-none">
        <FilterDropdown />
      </div>

      {/* Recent Collections Table as a Report */}
      <div className="space-y-4">
        <Suspense fallback={<TableSkeleton />}>
          <TransactionList month={month} year={year} branch={branch} officer={officer} search={search} page={page} limit={limit} />
        </Suspense>
      </div>
    </div>
  );
}
