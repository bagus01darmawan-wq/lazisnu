'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass';
}

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  variant = 'default',
}: ModalProps) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 transition-opacity',
          variant === 'glass'
            ? 'bg-black/60 backdrop-blur-md'
            : 'bg-black/50 backdrop-blur-sm'
        )}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className={cn(
          'relative z-10 w-full max-w-2xl transform bg-white rounded-2xl shadow-2xl transition-all flex flex-col max-h-[90vh]',
          variant === 'glass'
            ? 'bg-[#F4F1EA]/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.4)]'
            : 'bg-white rounded-2xl shadow-2xl',
          className
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-6 py-4 rounded-t-2xl',
            variant === 'glass'
              ? 'border-b border-white/10 bg-white/5'
              : 'border-b border-gray-100 bg-gray-50/50'
          )}
        >
          <h3
            className={cn(
              'text-lg font-bold',
              variant === 'glass' ? 'text-[#F4F1EA]' : 'text-gray-900'
            )}
          >
            {title || 'Detail'}
          </h3>
          <button
            onClick={onClose}
            className={cn(
              'p-1 rounded-full transition-colors',
              variant === 'glass'
                ? 'text-[#F4F1EA]/40 hover:bg-white/10 hover:text-[#F4F1EA]'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
            )}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'px-6 py-4 rounded-b-2xl',
              variant === 'glass'
                ? 'border-t border-white/10 bg-white/5'
                : 'border-t border-gray-100 bg-gray-50/50'
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export { Modal };
