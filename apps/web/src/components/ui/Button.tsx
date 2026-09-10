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
      // Brand-aligned (rencana migrasi bertahap, lihat plan-03).
      brand: 'bg-[#EAD19B] text-[#2C473E] hover:bg-[#EAD19B]/90 shadow-lg shadow-[#EAD19B]/20 font-bold',
      brandOutline: 'border border-[#EAD19B]/30 bg-transparent text-[#EAD19B] hover:bg-[#EAD19B]/10 font-bold',
      // Legacy (dipertahankan untuk backward compat, lihat plan-03).
      primary: 'bg-green-600 text-white hover:bg-green-700 shadow-sm',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
      outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 text-gray-700',
      ghost: 'bg-transparent hover:bg-gray-100 text-gray-600',
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
