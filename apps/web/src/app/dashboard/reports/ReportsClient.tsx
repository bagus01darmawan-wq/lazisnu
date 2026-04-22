'use client';

import React from 'react';
import { Table } from '@/components/ui/Table';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function ReportsClient({ data }: { data: any[] }) {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: 'collected_at',
      header: 'Tanggal',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-slate-500">
          {format(new Date(row.original.collected_at), 'PPP', { locale: id })}
        </span>
      ),
    },
    {
      accessorKey: 'qr_code',
      header: 'Kode Kaleng',
      cell: ({ row }) => <span className="font-bold text-slate-900">{row.original.qr_code}</span>,
    },
    {
      accessorKey: 'owner_name',
      header: 'Penyumbang',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.owner_name}</span>,
    },
    {
      accessorKey: 'officer_name',
      header: 'Petugas',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
             {row.original.officer_name.charAt(0)}
           </div>
           <span className="text-sm">{row.original.officer_name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'nominal',
      header: 'Nominal',
      cell: ({ row }) => (
        <span className="font-bold text-green-600">
          Rp {Number(row.original.nominal).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  return <Table columns={columns} data={data} loading={false} />;
}
