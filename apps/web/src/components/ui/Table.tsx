'use client';

import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, ChevronsUpDown } from 'lucide-react';
import { Button } from './Button';

interface TableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  className?: string;
  loading?: boolean;
  variant?: 'default' | 'glass';
}

const Table = <TData,>({ columns, data, className, loading, variant = 'default' }: TableProps<TData>) => {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={cn('w-full flex flex-col', className)}>
      <div className={cn(
        'overflow-x-auto rounded-xl shadow-sm transition-all duration-500',
        variant === 'glass' 
          ? 'bg-transparent border-none' 
          : 'bg-white border border-gray-200'
      )}>
        <table className="w-full text-left text-sm">
          <thead className={cn(
            'border-b transition-colors',
            variant === 'glass' 
              ? 'bg-[#F4F1EA]/5 border-white/10' 
              : 'bg-gray-50 border-gray-200'
          )}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-6 py-4 font-bold uppercase tracking-tight text-[10px] cursor-pointer transition-colors group",
                      variant === 'glass' 
                        ? "text-[#F4F1EA]/60 hover:bg-white/5" 
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ChevronsUpDown size={14} className={variant === 'glass' ? "text-[#F4F1EA]/30 group-hover:text-[#F4F1EA]/50" : "text-gray-400 group-hover:text-gray-600"} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className={cn(
            'divide-y transition-colors',
            variant === 'glass' ? 'divide-white/5' : 'divide-gray-100'
          )}>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400 font-medium">
                   Memuat data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400 font-medium">
                   Data tidak ditemukan.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={cn(
                  'transition-colors duration-300',
                  variant === 'glass' ? 'hover:bg-white/5' : 'hover:bg-gray-50/50'
                )}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn(
                      "px-6 py-4 font-medium",
                      variant === 'glass' ? "text-[#F4F1EA]/95" : "text-gray-700"
                    )}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export { Table };
