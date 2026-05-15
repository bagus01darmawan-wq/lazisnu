'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlassSelectOption {
  label: string;
  value: string;
}

interface GlassSelectProps {
  options: GlassSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
}

export function GlassSelect({
  options,
  value,
  onChange,
  placeholder = 'Pilih...',
  label,
  error,
  disabled = false,
  className,
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    setActiveIndex(-1);
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[activeIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          onChange(options[activeIndex].value);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <label className="text-sm font-semibold text-[#F4F1EA]/60">
          {label}
        </label>
      )}
      <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-2 px-4 h-11 w-full rounded-2xl border text-[11px] font-bold transition-all outline-none bg-[#F4F1EA]/10 border-[#F4F1EA]/20 backdrop-blur-md text-[#F4F1EA] hover:bg-[#F4F1EA]/20',
            isOpen && !disabled && 'bg-[#F4F1EA]/20 ring-1 ring-[#EAD19B]/30',
            disabled && 'opacity-40 cursor-not-allowed',
            error && 'border-red-400'
          )}
        >
          <span className={cn('flex-1 text-left truncate', !selectedOption && 'text-[#F4F1EA]/60')}>
            {selectedOption ? selectedOption.label : label || placeholder}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 transition-transform duration-300',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && !disabled && (
          <div className="absolute top-full mt-3 left-0 z-50 animate-in fade-in slide-in-from-top-2 duration-300 w-64">
            <div className="relative overflow-hidden rounded-2xl border border-[#F4F1EA]/15 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="absolute inset-0 bg-[#55675F]/95 backdrop-blur-xl" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.04)_22%,rgba(0,0,0,0.10)_100%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
              <div className="relative p-3">
                <div
                  ref={listRef}
                  className="max-h-52 overflow-y-auto custom-scrollbar space-y-0.5 rounded-xl bg-black/5 p-1"
                >
                  {options.length > 0 ? (
                    options.map((option, index) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-bold transition-all text-left',
                          activeIndex === index
                            ? 'bg-[#DE6F4A]/80 text-white shadow-lg shadow-[#DE6F4A]/20'
                            : value === option.value
                              ? 'bg-[#DE6F4A] text-white'
                              : 'text-[#DE6F4A] hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <span>{option.label}</span>
                        {value === option.value && (
                          <Check size={12} className="shrink-0 text-white" />
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="text-[10px] text-center py-4 text-[#F4F1EA]/30 font-medium">
                      Data tidak ditemukan
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs font-medium text-red-400">{error}</p>
      )}
    </div>
  );
}
