'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ColumnDef } from '@tanstack/react-table';
import { format, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { ShieldAlert, RefreshCw, Eye, Search, ChevronLeft, ChevronRight, RotateCcw, History, Clock, User, Database, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { ApiResponse } from '@lazisnu/shared-types';
import {
  formatAuditAction,
  formatAuditEntity,
  getAuditActionTone,
  summarizeAuditLog,
  AuditLog as IAuditLog
} from '@/lib/audit-log-formatters';

interface AuditLogResponse {
  id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  user?: { full_name: string; role: string };
  officer?: { full_name: string };
  old_data: unknown;
  new_data: unknown;
}

function mapAuditLog(log: AuditLogResponse): IAuditLog {
  return {
    id: log.id,
    actionType: log.action_type,
    entityType: log.entity_type,
    entityId: log.entity_id,
    createdAt: log.created_at,
    user: log.user
      ? { fullName: log.user.full_name, role: log.user.role }
      : undefined,
    officer: log.officer
      ? { fullName: log.officer.full_name }
      : undefined,
    oldData: log.old_data,
    newData: log.new_data,
  };
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<IAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<IAuditLog | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const fetchLogs = async (currentPage = page, searchQuery = search, m = month, y = year, limit = pageSize) => {
    try {
      setLoading(true);

      const startOfMonth = new Date(Number(y), Number(m) - 1, 1).toISOString();
      const endOfMonth = new Date(Number(y), Number(m), 0, 23, 59, 59).toISOString();

      const response = await api.get('/admin/audit-logs', {
        params: {
          page: currentPage,
          limit: limit,
          search: searchQuery,
          start_date: startOfMonth,
          end_date: endOfMonth
        }
      }) as unknown as ApiResponse<{ logs: AuditLogResponse[]; pagination: { total: number; total_pages: number } }>;
      if (response.success && response.data) {
        setLogs(response.data.logs.map(mapAuditLog));
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
  }, [search, month, year, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    setSearch('');
    setMonth(new Date().getMonth() + 1);
    setYear(new Date().getFullYear());
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchLogs(newPage, search, month, year);
  };

  const columns: ColumnDef<IAuditLog>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-[#EAD19B]" />
          <span>Waktu</span>
        </div>
      ),
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        return (
          <span className="text-xs font-medium text-[#F4F1EA]/60">
            {isValid(date) ? format(date, 'HH:mm dd/MM/yyyy', { locale: id }) : 'Waktu tidak valid'}
          </span>
        );
      },
    },
    {
      id: 'user',
      header: () => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[#EAD19B]" />
          <span>Operator</span>
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-[#F4F1EA]">{row.original.user?.fullName || row.original.officer?.fullName || 'Sistem'}</p>
          <p className="text-[10px] text-[#F4F1EA]/40 uppercase font-black">{row.original.user?.role || 'Sistem'}</p>
        </div>
      ),
    },
    {
      id: 'actionType',
      accessorKey: 'actionType',
      header: () => (
        <div className="flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-[#EAD19B]" />
          <span>Aksi</span>
        </div>
      ),
      cell: ({ row }) => {
        const type = row.original.actionType;
        const label = formatAuditAction(type);
        const tone = getAuditActionTone(type);
        
        let color = 'text-[#F4F1EA]/60';
        if (tone === 'success') color = 'text-[#1F8243]';
        else if (tone === 'warning') color = 'text-[#EAD19B]';
        else if (tone === 'danger') color = 'text-[#D97A76]';

        return <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</span>;
      },
    },
    {
      id: 'entityType',
      accessorKey: 'entityType',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Database size={12} className="text-[#EAD19B]" />
          <span>Entitas</span>
        </div>
      ),
      cell: ({ row }) => <span className="font-sans text-xs font-semibold text-[#F4F1EA]/85">{formatAuditEntity(row.original.entityType)}</span>,
    },
    {
      id: 'summary',
      header: () => (
        <div className="flex items-center gap-1.5">
          <FileText size={12} className="text-[#EAD19B]" />
          <span>Detail Aktivitas</span>
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-xs font-medium text-[#F4F1EA]/80 leading-relaxed max-w-[280px] xl:max-w-[400px] block text-wrap">
          {summarizeAuditLog(row.original)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => (
        <div className="flex items-center gap-1.5">
          <Eye size={12} className="text-[#EAD19B]" />
          <span>Detail</span>
        </div>
      ),
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedLog(row.original)}
          className="h-8 gap-2 border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300"
        >
          <Eye size={14} className="text-[#EAD19B]" />
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
      {/* Transparent Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full bg-transparent p-4 border-none shadow-none">
        <div className="relative group flex-1 md:max-w-[320px]">
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

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => void fetchLogs(page, search, month, year, pageSize)}
            className="h-[36px] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white/90 hover:bg-[#F4F1EA]/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
          >
            <RefreshCw size={14} strokeWidth={3} className={cn("text-[#EAD19B]", loading && "animate-spin")} />
            Refresh
          </button>

          <PeriodPicker
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
              setPage(1);
            }}
          />

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
            className="h-[36px] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white/90 hover:bg-[#F4F1EA]/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
          >
            <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
            Reset
          </button>
        </div>
      </div>

      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden transition-all duration-700">
        <Table columns={columns} data={logs} loading={loading} variant="glass" />

        {/* Smart Pagination Control (Option 2: Smart Info Badge) */}
        {!loading && totalItems > 0 && (
          <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Summary Info (Styled like Page Badge) */}
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm px-4 h-10">
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Menampilkan</span>
              <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                <span className="text-xs font-black text-[#EAD19B]">{logs.length}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
              <div className="min-w-[32px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                <span className="text-xs font-black text-[#F4F1EA]">{totalItems}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">Aktivitas</span>
            </div>

            {/* Right: Smart Control Pill */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
              {/* Page Info Badge */}
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

              {/* Navigation Arrows */}
              <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detail Aktivitas & Perubahan Data"
        className="max-w-4xl"
        variant="glass"
      >
        {selectedLog && (
          <div className="space-y-6">
            {/* Section 1: Ringkasan Manusiawi */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-[#EAD19B] tracking-wider uppercase">Ringkasan Aktivitas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="text-[#F4F1EA]/60 font-medium">Waktu: <span className="text-[#F4F1EA] font-bold">{isValid(new Date(selectedLog.createdAt)) ? format(new Date(selectedLog.createdAt), 'PPP HH:mm', { locale: id }) : 'Waktu tidak valid'}</span></p>
                  <p className="text-[#F4F1EA]/60 font-medium">Operator: <span className="text-[#F4F1EA] font-bold">{selectedLog.user?.fullName || selectedLog.officer?.fullName || 'Sistem'} <span className="text-[10px] text-[#EAD19B] px-1.5 py-0.5 rounded bg-[#EAD19B]/10 font-mono ml-1 uppercase">{selectedLog.user?.role || 'Sistem'}</span></span></p>
                </div>
                <div className="space-y-2">
                  <p className="text-[#F4F1EA]/60 font-medium">Tindakan: <span className="text-[#F4F1EA] font-bold">{formatAuditAction(selectedLog.actionType)}</span></p>
                  <p className="text-[#F4F1EA]/60 font-medium">Entitas: <span className="text-[#F4F1EA] font-bold">{formatAuditEntity(selectedLog.entityType)} {selectedLog.entityId ? `(ID: ${selectedLog.entityId})` : ''}</span></p>
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs font-bold text-[#F4F1EA]/40 uppercase tracking-widest mb-1.5">Deskripsi Perubahan</p>
                <div className="p-3.5 bg-white/5 rounded-xl border border-white/5 text-[#F4F1EA] text-sm leading-relaxed font-semibold">
                  {summarizeAuditLog(selectedLog)}
                </div>
              </div>
            </div>

            {/* Section 2: Detail Teknis */}
            <div>
              <h3 className="text-sm font-bold text-[#EAD19B] tracking-wider uppercase mb-3">Detail Perubahan Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#D97A76] uppercase tracking-wide">Data Sebelum</span>
                    <span className="text-[10px] text-[#F4F1EA]/40 font-mono">old_data</span>
                  </div>
                  <div className="bg-[#1C2421] border border-white/5 rounded-xl p-4 overflow-auto max-h-[300px] shadow-inner">
                    <pre className="text-[11px] text-[#D97A76] font-mono leading-relaxed">
                      {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : '// Tidak ada data sebelum.'}
                    </pre>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1F8243] uppercase tracking-wide">Data Sesudah</span>
                    <span className="text-[10px] text-[#F4F1EA]/40 font-mono">new_data</span>
                  </div>
                  <div className="bg-[#1C2421] border border-white/5 rounded-xl p-4 overflow-auto max-h-[300px] shadow-inner">
                    <pre className="text-[11px] text-[#1F8243] font-mono leading-relaxed">
                      {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : '// Tidak ada data sesudah.'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
