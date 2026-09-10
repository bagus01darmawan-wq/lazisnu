import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  footer?: React.ReactNode;
  variant?: 'default' | 'glass';
  contentClassName?: string;
}

const Card = ({ className, title, footer, children, variant = 'default', contentClassName, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-2xl transition-all duration-500 overflow-hidden',
        variant === 'glass'
          ? 'bg-[var(--glass)] backdrop-blur-2xl border border-[var(--border)] shadow-[0_20px_50px_rgba(0,0,0,0.3)]'
          : 'bg-[var(--surface)] text-[var(--surface-ink)] border border-[var(--border)] shadow-sm',
        className
      )}
      {...props}
    >
      {title && (
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--hover)]">
          <h3 className="text-sm font-bold text-[var(--surface-ink)]">{title}</h3>
        </div>
      )}
      <div className={cn('p-6', contentClassName)}>{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--hover)]">
          {footer}
        </div>
      )}
    </div>
  );
};

export { Card };
