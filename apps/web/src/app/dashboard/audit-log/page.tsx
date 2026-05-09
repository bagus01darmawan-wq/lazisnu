'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ColumnDef } from '@tanstack/react-table';
import { format, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { ShieldAlert, RefreshCw, Eye, Search, Calendar, ChevronLeft, ChevronRight, RotateCcw, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface AuditLog {
  id: string;
  actionType: string;
  entityType: string;
  createdAt: string;
  user?: { fullName: string; role: string };
  officer?: { fullName: string };
  oldData: any;
  newData: any;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());

  const fetchLogs = async (currentPage = page, searchQuery = search, m = month, y = year, limit = pageSize) => {
    try {
      setLoading(true);
      
      const startOfMonth = new Date(parseInt(y), parseInt(m) - 1, 1).toISOString();
      const endOfMonth = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59).toISOString();

      const response: any = await api.get('/admin/audit-logs', {
        params: { 
          page: currentPage, 
          limit: limit, 
          search: searchQuery,
          start_date: startOfMonth,
          end_date: endOfMonth
        }
      });
      if (response.success) {
        setLogs(response.data.logs);
        setTotalPages(response.data.pagination.total_pages);
        setTotalItems(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Fetch logs error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchLogs(1, search, month, year, pageSize);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, month, year, pageSize]);

  const handleReset = () => {
    setSearch('');
    setMonth((new Date().getMonth() + 1).toString());
    setYear(new Date().getFullYear().toString());
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchLogs(newPage, search, month, year);
  };

  const months = [
    { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' }, { value: '4', label: 'April' },
    { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' }, { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
  ];
  const currentYearNum = new Date().getFullYear();
  const years = [currentYearNum - 1, currentYearNum, currentYearNum + 1];

  const columns: ColumnDef<AuditLog>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Waktu',
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        return (
          <span className="text-xs font-medium text-gray-500">
            {isValid(date) ? format(date, 'PPP HH:mm', { locale: id }) : '-'}
          </span>
        );
      },
    },
    {
      id: 'actionType',
      accessorKey: 'actionType',
      header: 'Aksi',
      cell: ({ row }) => {
        const type = row.original.actionType || '';
        let variant: 'sent' | 'pending' | 'failed' | 'default' = 'default';
        if (type.includes('POST')) variant = 'sent';
        if (type.includes('PUT') || type.includes('PATCH')) variant = 'pending';
        if (type.includes('DELETE')) variant = 'failed';
        
        return <Badge variant={variant}>{type || 'UNKNOWN'}</Badge>;
      },
    },
    {
      header: 'Operator',
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-gray-900">{row.original.user?.fullName || row.original.officer?.fullName || 'System'}</p>
          <p className="text-[10px] text-gray-400 uppercase font-black">{row.original.user?.role || 'System'}</p>
        </div>
      ),
    },
    {
      id: 'entityType',
      accessorKey: 'entityType',
      header: 'Entitas',
      cell: ({ row }) => <span className="font-mono text-xs uppercase text-slate-500">{row.original.entityType || '-'}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setSelectedLog(row.original)}
          className="h-8 gap-2"
        >
          <Eye size={14} />
          Detail
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="text-[#EAD19B]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Log Aktivitas</h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">Lacak setiap perubahan data dan aktivitas sistem secara real-time.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative group flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#2C473E]/40" size={18} />
          <input
            type="text"
            placeholder="Cari aktivitas atau pelaku..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#F4F1EA] border border-[#2C473E]/10 rounded-xl text-sm text-[#2C473E] font-medium focus:outline-none focus:ring-4 focus:ring-[#1F8243]/10 focus:border-[#1F8243] transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 bg-[#F4F1EA] p-1 rounded-xl border border-[#2C473E]/10 shadow-sm">
          {[10, 20, 50].map((size) => (
            <button
              key={size}
              onClick={() => setPageSize(size)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                pageSize === size 
                  ? "bg-[#1F8243] text-white shadow-sm" 
                  : "text-[#2C473E]/60 hover:bg-[#2C473E]/5"
              )}
            >
              {size}
            </button>
          ))}
        </div>

        <button 
          onClick={() => void fetchLogs(page, search, month, year, pageSize)}
          className="h-10 rounded-xl px-4 text-xs font-bold text-[#2C473E]/60 border-[#2C473E]/10 hover:bg-[#F4F1EA] flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <Card className="p-0 border-none shadow-lg overflow-hidden">
        <Table columns={columns} data={logs} loading={loading} />
        
        {/* Pagination Controls (Cans-style) */}
        {!loading && totalItems > 0 && (
          <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
            <p className="text-xs font-medium text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{logs.length}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> aktivitas
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
      </Card>

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detail Perubahan Data"
        className="max-w-4xl"
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Badge variant="resubmit">Data Sebelum (Old)</Badge>
            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-[400px]">
              <pre className="text-[10px] text-red-400 font-mono">
                {selectedLog?.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : '// Tidak ada data sebelumnya (Aksi Penambahan)'}
              </pre>
            </div>
          </div>
          <div className="space-y-2">
            <Badge variant="sent">Data Sesudah (New)</Badge>
            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-[400px]">
              <pre className="text-[10px] text-green-400 font-mono">
                {selectedLog?.newData ? JSON.stringify(selectedLog.newData, null, 2) : '// Tidak ada data baru (Aksi Penghapusan)'}
              </pre>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
