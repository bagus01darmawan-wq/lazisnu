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
  Loader2
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const mockData = [
  { name: 'Ranting A', total: 4500000, count: 120 },
  { name: 'Ranting B', total: 3200000, count: 98 },
  { name: 'Ranting C', total: 5100000, count: 145 },
  { name: 'Ranting D', total: 2800000, count: 75 },
  { name: 'Ranting E', total: 3900000, count: 110 },
];

const mockTrends = [
  { day: 'Sen', nominal: 1200000 },
  { day: 'Sel', nominal: 1500000 },
  { day: 'Rab', nominal: 1100000 },
  { day: 'Kam', nominal: 2100000 },
  { day: 'Jum', nominal: 1800000 },
  { day: 'Sab', nominal: 2500000 },
  { day: 'Min', nominal: 2200000 },
];

export default function OverviewPage() {
  const { user } = useAuthStore();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const endpoint = user?.role === 'ADMIN_KECAMATAN' ? '/admin/district/dashboard' : '/admin/branch/dashboard';
      const response: any = await api.get(endpoint);
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Fetch stats error:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (user) fetchStats();
  }, [user]);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-green-600" size={40} />
        <p className="text-slate-500 font-medium tracking-tight">Menyiapkan statistik Anda...</p>
      </div>
    );
  }

  const summary = data.summary;
  const recentCollections = data.recent_collections || [];
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Welcome Section */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Selamat Datang 👋</h2>
        <p className="text-gray-500 text-sm mt-1">Berikut adalah ringkasan pengumpulan infaq Lazisnu periode April 2026.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Infaq</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">
                Rp {Number(summary.month_collection).toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
              <ArrowUpRight size={12} className="mr-1" /> 12%
            </span>
            <span className="text-xs text-gray-400 font-medium">dari bulan lalu</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Kaleng</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">{summary.total_cans}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
              <Box size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
              Aktif
            </span>
            <span className="text-xs text-blue-600 font-bold">1,192 Tersebar</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Petugas Lapangan</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">{summary.total_officers}</h3>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
             <Badge variant="sent">
               {user?.role === 'ADMIN_KECAMATAN' ? `${summary.total_branches} Ranting` : 'Aktif'}
             </Badge>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tingkat Koleksi</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">84.2%</h3>
            </div>
            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
              <ArrowDownRight size={12} className="mr-1" /> 2%
            </span>
            <span className="text-xs text-gray-400 font-medium">minggu ini</span>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title={user?.role === 'ADMIN_KECAMATAN' ? "Perolehan per Ranting" : "Perolehan per Petugas"} className="h-[450px] flex flex-col">
          <div className="flex-1 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={user?.role === 'ADMIN_KECAMATAN' ? data.by_branch : data.by_officer}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey={user?.role === 'ADMIN_KECAMATAN' ? "branch_name" : "officer_name"} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '12px'
                  }}
                  formatter={(value: any) => [`Rp ${value.toLocaleString('id-ID')}`, 'Nominal']}
                />
                <Bar 
                  dataKey="nominal" 
                  fill="#16a34a" 
                  radius={[6, 6, 0, 0]} 
                  barSize={user?.role === 'ADMIN_KECAMATAN' ? 48 : 24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Tren Infaq Harian (Minggu Ini)" className="h-[450px] flex flex-col">
          <div className="flex-1 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockTrends}>
                <defs>
                  <linearGradient id="colorNominal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="nominal" 
                  stroke="#16a34a" 
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
