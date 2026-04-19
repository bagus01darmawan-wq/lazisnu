import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  footer?: React.ReactNode;
}

const Card = ({ className, title, footer, children, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden',
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
