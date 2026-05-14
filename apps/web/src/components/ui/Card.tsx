import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  footer?: React.ReactNode;
  variant?: 'default' | 'glass';
}

const Card = ({ className, title, footer, children, variant = 'default', ...props }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-2xl transition-all duration-500 overflow-hidden',
        variant === 'glass' 
          ? 'bg-[#F4F1EA]/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]' 
          : 'bg-white border border-gray-200 shadow-sm',
        className
      )}
      {...props}
    >
      {title && (
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          {footer}
        </div>
      )}
    </div>
  );
};

export { Card };
