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
    // Brand-aligned — memakai token tema.
    brand: 'bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30',
    jelly: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30',
    // Status (standar §8 — dipakai semua tabel status, JANGAN dihapus).
    sent: 'bg-[var(--primary)]/15 text-[var(--surface-ink)] border-[var(--primary)]/30',
    pending: 'bg-[var(--accent)]/15 text-[var(--surface-ink)] border-[var(--accent)]/30',
    failed: 'bg-[var(--danger)]/15 text-[var(--surface-ink)] border-[var(--danger)]/30',
    resubmit: 'bg-[var(--accent)]/10 text-[var(--surface-ink)] border-[var(--accent)]/20 opacity-80',
    default: 'bg-[var(--surface)] text-[var(--surface-ink)] border-[var(--border)]',
    success: 'bg-[var(--primary)]/15 text-[var(--surface-ink)] border-[var(--primary)]/30',
    secondary: 'bg-[var(--surface)] text-[var(--surface-ink)] border-[var(--border)]',
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
