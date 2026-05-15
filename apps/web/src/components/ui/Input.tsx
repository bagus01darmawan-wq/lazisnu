import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'default' | 'glass';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, variant = 'default', ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className={cn(
            'text-sm font-semibold',
            variant === 'glass' ? 'text-[#F4F1EA]/60' : 'text-gray-700'
          )}>
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            'flex h-11 w-full rounded-xl border px-3 py-2 text-sm font-medium ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-text',
            variant === 'glass'
              ? 'bg-white/[0.03] border-white/10 text-[#F4F1EA] placeholder:text-[#F4F1EA]/30 focus-visible:ring-[#EAD19B]/30 focus-visible:border-[#EAD19B]/50 caret-[#F4F1EA]'
              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-green-500/20 focus-visible:ring-green-500 caret-slate-900',
            error && 'border-red-500 focus-visible:ring-red-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {error ? (
          <p className="text-xs font-medium text-red-500">{error}</p>
        ) : helperText ? (
          <p className={cn('text-xs', variant === 'glass' ? 'text-[#F4F1EA]/40' : 'text-gray-500')}>{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
