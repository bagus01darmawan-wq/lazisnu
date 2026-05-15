'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import {
  TrendingUp,
  Users,
  Box,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart3,
  BarChart2,
  AlertTriangle,
  LogIn,
  Calendar
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';




export default function OverviewPage() {
  const { user } = useAuthStore();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);



  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const endpoint = user?.role === 'ADMIN_KECAMATAN' ? '/admin/district/dashboard' : '/admin/branch/dashboard';
      const response: any = await api.get(endpoint);
      if (response.success) {
        setData(response.data);
      } else {
        setError(response.message || 'Gagal memuat data statistik');
      }
    } catch (err: any) {
      console.error('Fetch stats error:', err);
      setError(err.response?.data?.message || err.message || 'Terjadi kesalahan koneksi ke server');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (user) {
      void fetchStats();
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-[#1F8243]" size={40} />
        <p className="text-[#2C473E]/60 font-medium tracking-tight">Menyiapkan statistik Anda...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 bg-[#2C473E]/5 text-[#2C473E]/40 rounded-full flex items-center justify-center mb-2">
          <LogIn size={32} />
        </div>
        <h3 className="text-lg font-bold text-[#2C473E]">Sesi Berakhir</h3>
        <p className="text-[#2C473E]/60 text-sm">Silakan login kembali untuk melihat statistik.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 bg-[#D97A76]/10 text-[#D97A76] rounded-full flex items-center justify-center mb-2">
          <AlertTriangle size={32} />
        </div>
        <h3 className="text-lg font-bold text-[#2C473E]">Gagal Memuat Statistik</h3>
        <p className="text-[#2C473E]/60 text-sm max-w-xs">{error || 'Data tidak tersedia saat ini.'}</p>
        <button
          onClick={fetchStats}
          className="mt-4 px-6 py-2 bg-[#1F8243] text-white rounded-xl font-bold hover:bg-[#1F8243]/90 transition-all active:scale-95 shadow-lg shadow-[#1F8243]/20"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const summary = data.summary || {};
  const recentCollections = data.recent_collections || [];

  // 1. Kalkulasi Tren Infaq (Bulan ini vs Bulan lalu)
  const lastMonthColl = Number(summary.last_month_collection || 0);
  const currentMonthColl = Number(summary.month_collection || 0);
  let collTrend = 0;
  if (lastMonthColl > 0) {
    collTrend = ((currentMonthColl - lastMonthColl) / lastMonthColl) * 100;
  } else if (currentMonthColl > 0) {
    collTrend = 100;
  }

  // 2. Kalkulasi Tingkat Penjemputan & Tren
  const activeCans = Number(summary.active_cans || summary.total_cans || 0);
  const inactiveCans = Math.max(0, Number(summary.total_cans || 0) - Number(summary.active_cans || 0));
  const currentCount = Number(summary.month_count || 0);
  const lastCount = Number(summary.last_month_count || 0);

  const currentRate = activeCans > 0 ? (currentCount / activeCans) * 100 : 0;
  const lastRate = activeCans > 0 ? (lastCount / activeCans) * 100 : 0;
  const rateTrend = currentRate - lastRate;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Selamat Datang 👋</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Berikut adalah ringkasan pengumpulan infaq Lazisnu periode {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.</p>
          </div>
        </div>

      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-wider">Total Infaq</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-1">
                Rp {Number(summary.month_collection).toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-3 bg-[#1F8243]/10 text-[#1F8243] rounded-xl group-hover:bg-[#1F8243] group-hover:text-[#2C473E] transition-all duration-300">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${collTrend >= 0 ? 'text-[#1F8243] bg-[#1F8243]/10' : 'text-[#D97A76] bg-[#D97A76]/10'}`}>
              {collTrend >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
              {Math.abs(collTrend).toFixed(1)}%
            </span>
            <span className="text-xs text-[#F4F1EA]/40 font-medium">dari bulan lalu</span>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-wider">Kaleng Aktif</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-1">{summary.active_cans}</h3>
            </div>
            <div className="p-3 bg-[#C959A0]/10 text-[#C959A0] rounded-xl group-hover:bg-[#C959A0] group-hover:text-[#2C473E] transition-all duration-300">
              <Box size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-[#C959A0] bg-[#C959A0]/10 px-2 py-1 rounded-lg">{inactiveCans} Nonaktif
            </span>
            <span className="text-xs text-[#F4F1EA]/60 font-bold"> Total {summary.total_cans} </span>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-wider">Petugas Lapangan</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-1">{summary.total_officers}</h3>
            </div>
            <div className="p-3 bg-[#6B9E9F]/10 text-[#6B9E9F] rounded-xl group-hover:bg-[#6B9E9F] group-hover:text-[#2C473E] transition-all duration-300">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge variant="sent" className="bg-[#6B9E9F]/10 text-[#6B9E9F] border-none">
              {user?.role === 'ADMIN_KECAMATAN' ? `${summary.total_branches} Ranting` : 'Aktif'}
            </Badge>
          </div>
        </Card>

        <Card variant="glass" className="relative overflow-hidden group border-white/5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-wider">Penjemputan</p>
              <h3 className="text-2xl font-black text-[#F4F1EA] mt-1">{currentRate.toFixed(1)}%</h3>
            </div>
            <div className="p-3 bg-[#DE6F4A]/10 text-[#DE6F4A] rounded-xl group-hover:bg-[#DE6F4A] group-hover:text-[#2C473E] transition-all duration-300">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${rateTrend >= 0 ? 'text-[#1F8243] bg-[#1F8243]/10' : 'text-red-600 bg-red-50'}`}>
              {rateTrend >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
              {Math.abs(rateTrend).toFixed(1)}%
            </span>
            <span className="text-xs text-[#F4F1EA]/40 font-medium">dari bulan lalu</span>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card variant="glass" className="h-[450px] flex flex-col border-white/5">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <BarChart2 size={16} className="text-[#EAD19B]" />
              {user?.role === 'ADMIN_KECAMATAN' ? "Perolehan per Ranting" : "Perolehan per Petugas"}
            </h3>
          </div>
          <div className="flex-1 w-full mt-4 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={user?.role === 'ADMIN_KECAMATAN' ? data.by_branch : data.by_officer}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244, 241, 234, 0.08)" />
                <XAxis
                  dataKey={user?.role === 'ADMIN_KECAMATAN' ? "branch_name" : "officer_name"}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#F4F1EA', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#F4F1EA' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(244, 241, 234, 0.05)' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: '#2C473E',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                    fontSize: '12px',
                    color: '#F4F1EA'
                  }}
                  formatter={(value: any) => [`Rp ${value.toLocaleString('id-ID')}`, 'Nominal']}
                />
                <Bar
                  dataKey="nominal"
                  fill="#1F8243"
                  radius={[6, 6, 0, 0]}
                  barSize={user?.role === 'ADMIN_KECAMATAN' ? 48 : 24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant="glass" className="h-[450px] flex flex-col border-white/5">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <TrendingUp size={16} className="text-[#EAD19B]" />
              Tren Infaq Harian (Minggu Ini)
            </h3>
          </div>
          <div className="flex-1 w-full mt-4 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_trends || []}>
                <defs>
                  <linearGradient id="colorNominal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DE6F4A" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#DE6F4A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244, 241, 234, 0.08)" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#F4F1EA', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#F4F1EA' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: '#2C473E',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                    fontSize: '12px',
                    color: '#F4F1EA'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nominal"
                  stroke="#DE6F4A"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorNominal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
