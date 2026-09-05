'use client';

import React, { useState } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import {
  MessageSquare,
  Search,
  Clock,
  XCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  User,
  TrendingUp,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'sonner';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { cn } from '@/lib/utils';
import { ApiResponse } from '@lazisnu/shared-types';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

interface WaLogItem {
  id: string;
  recipient: string;
  phone: string;
  message: string;
  status: string;
  time: string;
}

interface RawWaLog {
  id: string;
  recipient_name?: string | null;
  recipient_phone: string;
  message_content: string;
  status: string;
  created_at: string;
}

interface WaLogsResponse {
  logs: RawWaLog[];
  pagination: {
    total: number;
    total_pages: number;
  };
  stats: {
    sent: number;
    pending: number;
    failed: number;
  };
}

interface WaSummaryStats {
  total_sent: number;
  total_failed: number;
  total_pending: number;
  total: number;
  success_rate: number;
}

interface WaDailyTrend {
  date: string;
  day: string;
  sent: number;
  failed: number;
  pending: number;
}

interface WaBranchStat {
  branch_id: string;
  branch_name: string;
  sent: number;
  failed: number;
  pending: number;
  total: number;
}

interface WaSummaryResponse {
  summary: WaSummaryStats;
  daily_trends: WaDailyTrend[];
  by_branch: WaBranchStat[];
  period: string;
}

interface FailedJobData {
  phone: string;
  ownerName: string;
  nominal: string;
  officerName: string;
  collectionId?: string;
  [key: string]: unknown;
}

interface FailedJob {
  id: string;
  name: string;
  data: FailedJobData;
  failedReason: string;
  timestamp: number;
  finishedOn?: number;
  attemptsMade: number;
}

interface FailedJobsResponse {
  total: number;
  jobs: FailedJob[];
}

function DailyTrendsChart({ data }: { data: WaDailyTrend[] }) {
  if (!data.length) return null;

  return (
    <Card variant="glass" className="relative overflow-hidden border-white/5">
      <div className="p-6">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
            <TrendingUp size={16} className="text-[#EAD19B]" />
            Tren 7 Hari (Database)
          </h3>
          <p className="text-[10px] text-[#F4F1EA]/40 mt-0.5">Jumlah notifikasi per hari — 7 hari terakhir</p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1F8243" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1F8243" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D97A76" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#D97A76" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244, 241, 234, 0.08)" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#F4F1EA', fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#F4F1EA' }}
              tickFormatter={(value) => value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value}
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
              formatter={(value, name) => [
                (value as number ?? 0).toLocaleString('id-ID'),
                name === 'sent' ? 'Terkirim' : name === 'failed' ? 'Gagal' : 'Pending'
              ]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="sent"
              stroke="#1F8243"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorSent)"
              name="Terkirim"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="failed"
              stroke="#D97A76"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorFailed)"
              name="Gagal"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function WAMonitorPage() {
  const [data, setData] = React.useState<WaLogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    sent: 0,
    pending: 0,
    failed: 0
  });
  const [dbStats, setDbStats] = React.useState<WaSummaryStats | null>(null);
  const [dailyTrends, setDailyTrends] = React.useState<WaDailyTrend[]>([]);
  const [dbLoading, setDbLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<'today' | 'week' | 'month' | 'all'>('month');
  
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [totalItems, setTotalItems] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState('');

  const fetchWAStatus = async (currentPage = page, searchQuery = search, limit = pageSize) => {
    setLoading(true);
    try {
      const response = await api.get('/admin/wa/logs', {
        params: { page: currentPage, limit: limit, search: searchQuery }
      }) as unknown as ApiResponse<WaLogsResponse>;
      if (response.success && response.data) {
        const items = response.data.logs || [];
        setData(items.map((notif) => ({
          id: notif.id,
          recipient: notif.recipient_name || 'Donatur',
          phone: notif.recipient_phone,
          message: notif.message_content,
          status: notif.status,
          time: notif.created_at
        })));
        setTotalItems(response.data.pagination?.total || 0);
        setTotalPages(response.data.pagination?.total_pages || 1);
        if (response.data.stats) {
          setStats(response.data.stats);
        }
      }
    } catch (error) {
      const getApiErrorMessage = (err: unknown) => {
        if (err && typeof err === 'object') {
          const record = err as { error?: { message?: string }, message?: string };
          return record.error?.message || record.message;
        }
        return undefined;
      };
      const message = getApiErrorMessage(error) || 'Gagal mengambil status WhatsApp';
      console.error('Failed to fetch WA status:', error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWASummary = async (selectedPeriod: 'today' | 'week' | 'month' | 'all' = period) => {
    setDbLoading(true);
    try {
      const response = await api.get('/admin/wa/summary', {
        params: { period: selectedPeriod }
      }) as unknown as ApiResponse<WaSummaryResponse>;
      if (response.success && response.data) {
        setDbStats(response.data.summary);
        setDailyTrends(response.data.daily_trends || []);
      }
    } catch (error) {
      console.error('Failed to fetch WA summary:', error);
    } finally {
      setDbLoading(false);
    }
  };

  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [failedJobsLoading, setFailedJobsLoading] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const fetchFailedJobs = async () => {
    setFailedJobsLoading(true);
    try {
      const response = await api.get('/admin/wa/failed') as unknown as ApiResponse<FailedJobsResponse>;
      if (response.success && response.data) {
        setFailedJobs(response.data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to fetch failed jobs:', error);
    } finally {
      setFailedJobsLoading(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingIds(prev => new Set(prev).add(jobId));
    try {
      const response = await api.post(`/admin/wa/retry/${jobId}`) as unknown as ApiResponse<{ message: string; jobId: string }>;
      if (response.success) {
        toast.success('Job berhasil dijadwalkan ulang');
        setFailedJobs(prev => prev.filter(j => j.id !== jobId));
      }
    } catch (error) {
      const getApiErrorMessage = (err: unknown) => {
        if (err && typeof err === 'object') {
          const record = err as { error?: { message?: string }, message?: string };
          return record.error?.message || record.message;
        }
        return undefined;
      };
      toast.error(getApiErrorMessage(error) || 'Gagal retry job');
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleRetryAll = async () => {
    if (failedJobs.length === 0) return;
    const allIds = failedJobs.map(j => j.id);
    setRetryingIds(new Set(allIds));
    let successCount = 0;
    for (const jobId of allIds) {
      try {
        const response = await api.post(`/admin/wa/retry/${jobId}`) as unknown as ApiResponse<{ message: string }>;
        if (response.success) successCount++;
      } catch { /* continue */ }
    }
    toast.success(`${successCount}/${allIds.length} job berhasil dijadwalkan ulang`);
    setRetryingIds(new Set());
    void fetchFailedJobs();
  };

  const handleFlushFailed = async () => {
    try {
      const response = await api.post('/admin/wa/flush-failed') as unknown as ApiResponse<void>;
      if (response.success) {
        toast.success('Antrean berhasil dibersihkan');
        setFailedJobs([]);
        void fetchWAStatus();
      }
    } catch {
      toast.error('Gagal membersihkan antrean');
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      void fetchWAStatus(1, search, pageSize);
      void fetchWASummary(period);
      void fetchFailedJobs();
    }, 500);
    return () => clearTimeout(timer);
  }, [search, pageSize, period]);

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

  const columns: ColumnDef<WaLogItem>[] = [
    {
      accessorKey: 'time',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-[#EAD19B]" />
          <span>Waktu</span>
        </div>
      ),
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
      header: () => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[#EAD19B]" />
          <span>Penerima</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#F4F1EA]">{row.original.recipient}</span>
          <span className="text-[10px] text-[#F4F1EA]/40 font-bold uppercase tracking-widest">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'message',
      header: () => (
        <div className="flex items-center gap-1.5">
          <MessageSquare size={12} className="text-[#EAD19B]" />
          <span>Pesan</span>
        </div>
      ),
      cell: ({ row }) => <span className="text-xs text-[#F4F1EA]/60 line-clamp-1">{row.original.message}</span>,
    },
    {
      accessorKey: 'status',
      header: () => (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-[#EAD19B]" />
          <span>Status</span>
        </div>
      ),
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

          <Button
            onClick={() => { void fetchWAStatus(page, search, pageSize); void fetchFailedJobs(); }}
            className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <RefreshCw size={14} strokeWidth={3} className={cn(loading && "animate-spin")} />
            Refresh Status
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-[#F4F1EA]/5 backdrop-blur-md rounded-2xl border border-[#F4F1EA]/10">
            <div className="flex items-center gap-3">
              <MessageSquare className="text-[#EAD19B]" size={20} />
              <div>
                <p className="text-xs font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Statistik Historis (Database)</p>
                <p className="text-xs text-[#F4F1EA]/40">Data kumulatif dari tabel notifications, tidak hilang saat restart Redis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#F4F1EA]/50">Periode:</span>
              <DropdownFilter
                options={[
                  { label: 'Hari Ini', value: 'today' },
                  { label: '7 Hari', value: 'week' },
                  { label: 'Bulan Ini', value: 'month' },
                  { label: 'Semua', value: 'all' }
                ]}
                value={period}
                onChange={(val) => {
                  setPeriod(val as 'today' | 'week' | 'month' | 'all');
                }}
                className="h-[36px] min-w-[120px]"
                showSearch={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#1F8243]/10 text-[#1F8243] rounded-2xl group-hover:bg-[#1F8243] group-hover:text-white transition-all duration-500 shadow-lg">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Terkirim (Queue)</p>
                  <h3 className="text-xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.sent}</h3>
                  <p className="text-[9px] text-[#F4F1EA]/40">Real-time BullMQ</p>
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
                  <h3 className="text-xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.pending}</h3>
                  <p className="text-[9px] text-[#F4F1EA]/40">Real-time BullMQ</p>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#DE6F4A]/10 text-[#DE6F4A] rounded-2xl group-hover:bg-[#DE6F4A] group-hover:text-white transition-all duration-500 shadow-lg">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Gagal (Queue)</p>
                  <h3 className="text-xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">{stats.failed}</h3>
                  <p className="text-[9px] text-[#F4F1EA]/40">Real-time BullMQ</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#1F8243]/10 text-[#1F8243] rounded-2xl group-hover:bg-[#1F8243] group-hover:text-white transition-all duration-500 shadow-lg">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Total Terkirim</p>
                    <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">
                      {dbStats?.total_sent?.toLocaleString('id-ID') ?? (dbLoading ? '...' : '0')}
                    </h3>
                    <p className="text-[9px] text-[#F4F1EA]/40">Database historis</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#DE6F4A]/10 text-[#DE6F4A] rounded-2xl group-hover:bg-[#DE6F4A] group-hover:text-white transition-all duration-500 shadow-lg">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Total Gagal</p>
                    <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">
                      {dbStats?.total_failed?.toLocaleString('id-ID') ?? (dbLoading ? '...' : '0')}
                    </h3>
                    <p className="text-[9px] text-[#F4F1EA]/40">Database historis</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#EAD19B]/10 text-[#EAD19B] rounded-2xl group-hover:bg-[#EAD19B] group-hover:text-[#2C473E] transition-all duration-500 shadow-lg">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Success Rate</p>
                    <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">
                      {dbStats ? `${dbStats.success_rate}%` : (dbLoading ? '...' : '0%')}
                    </h3>
                    <p className="text-[9px] text-[#F4F1EA]/40">Terkirim / (Terkirim + Gagal)</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="relative overflow-hidden group border-white/5">
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#6B9E9F]/10 text-[#6B9E9F] rounded-2xl group-hover:bg-[#6B9E9F] group-hover:text-white transition-all duration-500 shadow-lg">
                    <Clock size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">Total Pending</p>
                    <h3 className="text-2xl font-black text-[#F4F1EA] mt-0.5 tracking-tight">
                      {dbStats?.total_pending?.toLocaleString('id-ID') ?? (dbLoading ? '...' : '0')}
                    </h3>
                    <p className="text-[9px] text-[#F4F1EA]/40">Masih menunggu antrean</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {dailyTrends.length > 0 && <DailyTrendsChart data={dailyTrends} />}

          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-transparent p-4 md:p-5 border-none shadow-none">
            <div className="relative w-full lg:w-80 group">
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

          {!loading && totalItems > 0 && (
            <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
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

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
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

        <div className="bg-[#DE6F4A]/10 backdrop-blur-md p-6 rounded-3xl border border-[#DE6F4A]/20 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#DE6F4A]/20 text-[#F4F1EA] rounded-2xl shadow-lg">
                <XCircle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-[#F4F1EA] tracking-tight">Antrean Gagal (DLQ)</h3>
                <p className="text-xs text-[#F4F1EA]/60 font-medium max-w-md mt-0.5">
                  {failedJobs.length > 0
                    ? `${failedJobs.length} job gagal menunggu diproses ulang.`
                    : 'Tidak ada job gagal. Mantap.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {failedJobs.length > 0 && (
                <button
                  onClick={handleRetryAll}
                  disabled={retryingIds.size > 0}
                  className="px-4 py-2 bg-[#EAD19B] text-[#2C473E] text-xs font-bold rounded-2xl hover:bg-[#EAD19B]/90 transition-all active:scale-95 shadow-lg shadow-[#EAD19B]/20 flex items-center gap-2 disabled:opacity-50"
                >
                  <RotateCcw size={14} strokeWidth={3} className={retryingIds.size > 0 ? 'animate-spin' : ''} />
                  Retry Semua
                </button>
              )}
              <button
                onClick={handleFlushFailed}
                className="px-4 py-2 bg-[#DE6F4A] text-white text-xs font-bold rounded-2xl hover:bg-[#DE6F4A]/90 transition-all active:scale-95 shadow-lg shadow-[#DE6F4A]/30 flex items-center gap-2 border border-white/10"
              >
                <Trash2 size={14} />
                Bersihkan Semua
              </button>
            </div>
          </div>

          {failedJobs.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {failedJobs.map(job => (
                <div key={job.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#2C473E]/40 rounded-2xl border border-white/5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-widest truncate">
                        {job.id}
                      </span>
                      <span className="text-[9px] font-bold text-[#DE6F4A] bg-[#DE6F4A]/10 px-2 py-0.5 rounded-full">
                        {job.attemptsMade}x gagal
                      </span>
                    </div>
                    <p className="text-xs text-[#F4F1EA]/80 font-medium">
                      {job.data.ownerName || 'Donatur'} — {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(BigInt(job.data.nominal || 0))}
                    </p>
                    <p className="text-[10px] text-[#F4F1EA]/40 mt-0.5 line-clamp-1">
                      {job.failedReason || 'Tidak diketahui'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRetry(job.id)}
                    disabled={retryingIds.has(job.id)}
                    className="shrink-0 px-4 py-1.5 bg-[#1F8243]/20 text-[#1F8243] text-[11px] font-bold rounded-xl hover:bg-[#1F8243]/30 transition-all active:scale-95 flex items-center gap-1.5 border border-[#1F8243]/20 disabled:opacity-40"
                  >
                    <RotateCcw size={12} strokeWidth={3} className={retryingIds.has(job.id) ? 'animate-spin' : ''} />
                    Retry
                  </button>
                </div>
              ))}
            </div>
          )}

          {!failedJobsLoading && failedJobs.length === 0 && (
            <div className="text-center py-4">
              <CheckCircle2 size={32} className="text-[#1F8243]/40 mx-auto mb-2" />
              <p className="text-xs text-[#F4F1EA]/40 font-medium">Semua bersih, tidak ada job gagal.</p>
            </div>
          )}

          {failedJobsLoading && (
            <div className="text-center py-4">
              <RefreshCw size={20} className="text-[#F4F1EA]/40 mx-auto animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}