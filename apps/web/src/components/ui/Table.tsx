'use client';

import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';

interface TableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  className?: string;
  loading?: boolean;
  variant?: 'default' | 'glass';
}

const Table = <TData,>({ columns, data, className, loading, variant = 'default' }: TableProps<TData>) => {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  
  // eslint-disable-next-line react-hooks/incompatible-library
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
          : 'bg-[var(--surface)] text-[var(--surface-ink)] border border-[var(--border)]'
      )}>
        <table className="w-full text-left text-sm">
          <thead className={cn(
            'border-b transition-colors',
            variant === 'glass' 
              ? 'bg-[var(--glass)] border-[var(--border)]' 
              : 'bg-[var(--hover)] border-[var(--border)]'
          )}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-3 py-3 md:px-6 md:py-4 font-bold uppercase tracking-tight text-[10px] cursor-pointer transition-colors group",
                      variant === 'glass' 
                        ? "text-[var(--glass-ink)]/60 hover:bg-[var(--hover)]" 
                        : "text-[var(--surface-ink)]/70 hover:bg-[var(--hover)]"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ChevronsUpDown size={14} className={variant === 'glass' ? "text-[var(--glass-ink)]/30 group-hover:text-[var(--glass-ink)]/50" : "text-[var(--surface-ink)]/50 group-hover:text-[var(--surface-ink)]"} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className={cn(
            'divide-y transition-colors',
            variant === 'glass' ? 'divide-[var(--border)]' : 'divide-[var(--border)]'
          )}>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-3 md:px-6 py-12 text-center text-[var(--surface-ink)]/60 font-medium">
                   Memuat data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 md:px-6 py-12 text-center text-[var(--surface-ink)]/60 font-medium">
                   Data tidak ditemukan.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={cn(
                  'transition-colors duration-300',
                  variant === 'glass' ? 'hover:bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
                )}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn(
                      "px-3 py-3 md:px-6 md:py-4 font-medium",
                      variant === 'glass' ? "text-[var(--glass-ink)]" : "text-[var(--surface-ink)]"
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
