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
  /**
   * `bottom` menempelkan dialog ke bawah pada layar kecil (bottom sheet),
   * lalu kembali ke tengah pada layar `sm` ke atas.
   */
  position?: 'center' | 'bottom';
  /**
   * false menutup jalur keluar implisit (Escape, overlay, tombol X) — dipakai
   * saat proses di dalam dialog sedang berjalan (mis. submit) supaya sheet
   * tidak tertutup di tengah operasi. Jalur eksplisit (tombol Batal/proses)
   * tetap milik pemanggil.
   */
  dismissible?: boolean;
}

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  variant = 'default',
  position = 'center',
  dismissible = true,
}: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Keep the latest onClose in a ref so the open/close effect below does not
  // depend on its (usually inline, unstable) identity. Without this, every
  // parent re-render — e.g. typing in a form field — re-runs the effect,
  // restores focus to the trigger, and steals the caret out of the input.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // dismissible juga bisa berubah saat dialog terbuka (mis. submitting),
  // dan effect open/close tidak boleh ikut re-run setiap kali itu terjadi.
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    dismissibleRef.current = dismissible;
  }, [dismissible]);

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
        if (dismissibleRef.current) onCloseRef.current();
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
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center',
        position === 'bottom' ? 'items-end p-0 sm:items-center sm:p-4' : 'items-center p-4'
      )}
    >
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 transition-opacity',
          variant === 'glass'
            ? 'bg-black/60 backdrop-blur-md'
            : 'bg-black/50 backdrop-blur-sm'
        )}
        onClick={dismissible ? onClose : undefined}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'relative z-10 w-full max-w-2xl transform shadow-2xl transition-all flex flex-col max-h-[90vh]',
          position === 'bottom'
            ? 'rounded-t-2xl rounded-b-none sm:rounded-2xl max-h-[85vh]'
            : 'rounded-2xl',
          variant === 'glass'
            ? 'bg-[var(--glass)] text-[var(--glass-ink)] backdrop-blur-2xl border border-[var(--border)] shadow-[0_20px_50px_rgba(0,0,0,0.4)]'
            : 'bg-[var(--surface)] text-[var(--surface-ink)]',
          className
        )}
      >
        {/* Handle bar bottom sheet (mobile saja; sm ke atas dialog kembali ke tengah) */}
        {position === 'bottom' && (
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-current opacity-20" />
          </div>
        )}

        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 md:px-6 py-4 rounded-t-2xl',
            variant === 'glass'
              ? 'border-b border-[var(--border)] bg-[var(--hover)]'
              : 'border-b border-[var(--border)] bg-[var(--hover)]'
          )}
        >
          <h3
            id="modal-title"
            className={cn(
              'text-lg font-bold',
              variant === 'glass' ? 'text-[var(--glass-ink)]' : 'text-[var(--surface-ink)]'
            )}
          >
            {title || 'Detail'}
          </h3>
          {dismissible && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog"
              className={cn(
                'p-2 rounded-full transition-colors',
                variant === 'glass'
                  ? 'text-[var(--glass-ink)]/40 hover:bg-[var(--hover)] hover:text-[var(--glass-ink)]'
                  : 'text-[var(--surface-ink)]/50 hover:bg-[var(--hover)] hover:text-[var(--surface-ink)]'
              )}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Body */}
        <div
          className={cn(
            'p-4 md:p-6 overflow-y-auto flex-1',
            position === 'bottom' && 'pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6'
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'px-4 md:px-6 py-4 rounded-b-2xl',
              variant === 'glass'
                ? 'border-t border-[var(--border)] bg-[var(--hover)]'
                : 'border-t border-[var(--border)] bg-[var(--hover)]'
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
