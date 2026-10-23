'use client';

import { AlertTriangle, Box, CheckCircle2, History, UserPlus } from 'lucide-react';

type EmptyVariant = 'all-assigned' | 'no-officers' | 'no-cans' | 'error' | 'no-groups';

interface AssignmentEmptyStateProps {
  variant: EmptyVariant;
  title?: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const VARIANT_ICON = {
  'all-assigned': CheckCircle2,
  'no-officers': UserPlus,
  'no-cans': Box,
  error: AlertTriangle,
  'no-groups': CheckCircle2,
};

const VARIANT_TONE = {
  'all-assigned': 'text-[#1F8243] bg-[#1F8243]/10 border-[#1F8243]/20',
  'no-officers': 'text-[#EAD19B] bg-[#EAD19B]/10 border-[#EAD19B]/20',
  'no-cans': 'text-[#EAD19B] bg-[#EAD19B]/10 border-[#EAD19B]/20',
  error: 'text-[#DE6F4A] bg-[#DE6F4A]/10 border-[#DE6F4A]/20',
  'no-groups': 'text-[#1F8243] bg-[#1F8243]/10 border-[#1F8243]/20',
};

export function AssignmentEmptyState({
  variant,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: AssignmentEmptyStateProps) {
  const Icon = VARIANT_ICON[variant];
  const tone = VARIANT_TONE[variant];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-5 py-10 text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${tone}`}
      >
        <Icon size={26} />
      </div>
      <h2 className="mt-4 text-lg font-black tracking-tight text-[#F4F1EA]">
        {title ?? 'Tidak ada data'}
      </h2>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[#F4F1EA]/50">
          {description}
        </p>
      )}

      {(onPrimary || onSecondary) && (
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          {onPrimary && primaryLabel && (
            <button
              type="button"
              onClick={onPrimary}
              className="h-11 rounded-xl bg-[#EAD19B] px-5 text-[11px] font-black text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 transition-all hover:bg-[#EAD19B]/90 active:scale-95"
            >
              {primaryLabel}
            </button>
          )}
          {onSecondary && secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-[11px] font-bold text-[#F4F1EA] transition-all hover:bg-white/10 active:scale-95"
            >
              <History size={13} className="text-[#EAD19B]" />
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
