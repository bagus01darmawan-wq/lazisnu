import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'danger'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'brand'
    | 'brandOutline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const variants = {
      // Brand-aligned — memakai token tema agar ikut berubah.
      brand: 'bg-[var(--primary)] text-[var(--primary-ink)] hover:opacity-90 shadow-lg shadow-[var(--primary)]/20 font-bold',
      brandOutline: 'border border-[var(--primary)]/30 bg-transparent text-[var(--primary)] hover:bg-[var(--primary)]/10 font-bold',
      // Legacy (dipertahankan untuk backward compat).
      primary: 'bg-[var(--primary)] text-[var(--primary-ink)] hover:opacity-90 shadow-sm',
      danger: 'bg-[var(--danger)] text-white hover:opacity-90 shadow-sm',
      secondary: 'bg-[var(--surface)] text-[var(--surface-ink)] hover:opacity-90',
      outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--hover)] text-[var(--surface-ink)]',
      ghost: 'bg-transparent hover:bg-[var(--hover)] text-[var(--surface-ink)]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-300 focus:outline-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
