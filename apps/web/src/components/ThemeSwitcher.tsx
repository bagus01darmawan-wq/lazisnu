'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES, useTheme } from './ThemeProvider';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ganti tema tampilan"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Ganti tema tampilan"
        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--text)] transition-all active:scale-95 flex items-center justify-center"
      >
        <Palette size={18} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-[300px] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-2xl border border-[var(--border)] bg-[var(--canvas)]/95 backdrop-blur-xl shadow-2xl p-3 z-50"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] px-1 pb-2">
            Pilih Tema
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {THEMES.map((t) => {
              const active = t.key === theme;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setTheme(t.key);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full rounded-xl px-2.5 py-2 text-left transition-colors ${
                    active ? 'bg-[var(--hover)] ring-1 ring-[var(--primary)]' : 'hover:bg-[var(--hover)]'
                  }`}
                >
                  <span className="flex shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                    <span className="block w-4 h-9" style={{ background: t.canvas }} />
                    <span className="block w-4 h-9" style={{ background: t.primary }} />
                    <span className="block w-4 h-9" style={{ background: t.surface }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text)] truncate">{t.name}</span>
                  </span>
                  {active && <Check size={16} className="text-[var(--primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
