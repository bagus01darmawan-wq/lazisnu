import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
  icon?: React.ReactNode;
}

const EmptyState = ({
  title = 'Data tidak ditemukan',
  description = 'Maaf, sepertinya belum ada data untuk ditampilkan saat ini.',
  className,
  icon,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 bg-white rounded-2xl border-2 border-dashed border-gray-100 text-center',
        className
      )}
    >
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
        {icon || <Database size={32} />}
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs">{description}</p>
    </div>
  );
};

export { EmptyState };
