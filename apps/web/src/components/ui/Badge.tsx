import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | 'sent'
    | 'pending'
    | 'failed'
    | 'resubmit'
    | 'default'
    | 'success'
    | 'secondary'
    | 'brand'
    | 'jelly';
}

const Badge = ({ className, variant = 'default', children, ...props }: BadgeProps) => {
  const variants = {
    // Brand-aligned (lihat plan-03).
    brand: 'bg-[#EAD19B]/15 text-[#EAD19B] border-[#EAD19B]/30',
    jelly: 'bg-[#DE6F4A]/10 text-[#DE6F4A] border-[#DE6F4A]/30',
    // Status (standar §8 — dipakai semua tabel status, JANGAN dihapus).
    sent: 'bg-green-100 text-green-800 border-green-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    resubmit: 'bg-yellow-50 text-yellow-700 border-yellow-100 opacity-75',
    default: 'bg-gray-100 text-gray-800 border-gray-200',
    success: 'bg-green-100 text-green-800 border-green-200',
    secondary: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {variant === 'resubmit' && <span className="mr-1">↺</span>}
      {children}
    </div>
  );
};

export { Badge };
