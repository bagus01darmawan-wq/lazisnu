'use client';

import React, { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ShieldAlert, RefreshCw, Eye } from 'lucide-react';

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

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response: any = await api.get('/admin/audit-logs');
      if (response.success) {
        setLogs(response.data.logs);
      }
    } catch (error) {
      console.error('Fetch logs error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Waktu',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-gray-500">
          {format(new Date(row.original.createdAt), 'PPP HH:mm', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'actionType',
      header: 'Aksi',
      cell: ({ row }) => {
        const type = row.original.actionType;
        let variant: 'sent' | 'pending' | 'failed' | 'default' = 'default';
        if (type.includes('POST')) variant = 'sent';
        if (type.includes('PUT') || type.includes('PATCH')) variant = 'pending';
        if (type.includes('DELETE')) variant = 'failed';
        
        return <Badge variant={variant}>{type}</Badge>;
      },
    },
    {
      header: 'Pelaku',
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-gray-900">{row.original.user?.fullName || row.original.officer?.fullName || 'System'}</p>
          <p className="text-[10px] text-gray-400 uppercase font-black">{row.original.user?.role || 'System'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'entityType',
      header: 'Entitas',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.entityType}</span>,
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldAlert className="text-green-600" />
            Audit Log Aktivitas
          </h2>
          <p className="text-sm text-gray-500">Transparansi penuh atas setiap perubahan data di sistem Lazisnu.</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" className="gap-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <Card className="p-0 border-none shadow-lg">
        <Table columns={columns} data={logs} loading={loading} />
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
                {selectedLog?.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : '// No previous data'}
              </pre>
            </div>
          </div>
          <div className="space-y-2">
            <Badge variant="sent">Data Sesudah (New)</Badge>
            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-[400px]">
              <pre className="text-[10px] text-green-400 font-mono">
                {selectedLog?.newData ? JSON.stringify(selectedLog.newData, null, 2) : '// No new data'}
              </pre>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
