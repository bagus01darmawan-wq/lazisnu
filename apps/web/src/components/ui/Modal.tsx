'use client';

import React, { useEffect, useRef } from 'react';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save the element that had focus before opening (will be restored on close).
    previouslyFocused.current = document.activeElement as HTMLElement;

    // Initial focus to close button (safer default than first focusable,
    // karena close button pasti visible & accessible).
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Tab trap: cycle focus within modal so keyboard users can't escape
      // into the background (inert) content.
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the trigger element.
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
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
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
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
            'flex items-center justify-between px-4 md:px-6 py-4 rounded-t-2xl',
            variant === 'glass'
              ? 'border-b border-white/10 bg-white/5'
              : 'border-b border-gray-100 bg-gray-50/50'
          )}
        >
          <h3
            id="modal-title"
            className={cn(
              'text-lg font-bold',
              variant === 'glass' ? 'text-[#F4F1EA]' : 'text-gray-900'
            )}
          >
            {title || 'Detail'}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className={cn(
              'p-2 rounded-full transition-colors',
              variant === 'glass'
                ? 'text-[#F4F1EA]/40 hover:bg-white/10 hover:text-[#F4F1EA]'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
            )}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'px-4 md:px-6 py-4 rounded-b-2xl',
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
