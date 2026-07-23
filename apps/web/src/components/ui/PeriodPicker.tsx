'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PeriodPickerProps {
  months: number[];
  year: number;
  onChange: (months: number[], year: number) => void;
  className?: string;
}

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function PeriodPicker({ months, year, onChange, className }: PeriodPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const allMonthsSelected = months.length === 12;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMonth = useCallback((m: number) => {
    if (months.includes(m)) {
      onChange(months.filter(x => x !== m), year);
    } else {
      onChange([...months, m].sort((a, b) => a - b), year);
    }
  }, [months, year, onChange]);

  const toggleYear = useCallback((y: number) => {
    if (y === year && allMonthsSelected) {
      onChange([], y);
    } else {
      onChange(Array.from({ length: 12 }, (_, i) => i + 1), y);
    }
  }, [year, allMonthsSelected, onChange]);

  const selectSingleMonth = useCallback((m: number, y: number) => {
    onChange([m], y);
  }, [onChange]);

  const displayLabel = months.length === 0
    ? `${monthNames[new Date().getMonth()]} ${year}`
    : months.length === 1
      ? `${monthNames[months[0] - 1]} ${year}`
      : months.length === 12
        ? `Jan-Des ${year}`
        : `${months.length} Bulan ${year}`;

  return (
    <div className={cn("relative h-[36px]", className)} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 h-full bg-[#F4F1EA]/10 border border-[#F4F1EA]/20 backdrop-blur-md rounded-2xl text-[11px] font-bold text-[#F4F1EA] hover:bg-[#F4F1EA]/20 transition-all",
          isOpen && "bg-[#F4F1EA]/20 ring-1 ring-[#EAD19B]/30"
        )}
      >
        <Calendar size={14} className="text-[#EAD19B]" />
        <span className="uppercase tracking-wider">
          {displayLabel}
        </span>
        <ChevronDown size={14} className={cn("ml-1 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-3 left-0 bg-[#F4F1EA]/10 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-300 min-w-[280px]">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-[#F4F1EA]/30 uppercase tracking-[0.2em] mb-2 px-2">Bulan</p>
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                {monthNames.map((m, i) => {
                  const monthNum = i + 1;
                  const checked = months.includes(monthNum);
                  return (
                    <div key={m} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMonth(monthNum)}
                        className={cn(
                          "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all",
                          checked
                            ? "bg-[#DE6F4A] border-[#DE6F4A]"
                            : "border-[#F4F1EA]/30 hover:border-[#F4F1EA]/60"
                        )}
                      >
                        {checked && <Check size={10} className="text-white" strokeWidth={4} />}
                      </button>
                      <button
                        onClick={() => selectSingleMonth(monthNum, year)}
                        className={cn(
                          "flex-1 text-left px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight",
                          months.length === 1 && checked
                            ? "bg-[#DE6F4A] text-white shadow-lg shadow-[#DE6F4A]/20"
                            : "text-[#DE6F4A] hover:bg-[#DE6F4A]/10"
                        )}
                      >
                        {m}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1 border-l border-white/5 pl-3">
              <p className="text-[9px] font-black text-[#F4F1EA]/30 uppercase tracking-[0.2em] mb-2 px-2">Tahun</p>
              <div className="space-y-2">
                {years.map((y) => {
                  const isActive = y === year;
                  const yearChecked = isActive && allMonthsSelected;
                  return (
                    <div key={y} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleYear(y)}
                        className={cn(
                          "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all",
                          yearChecked
                            ? "bg-[#EAD19B] border-[#EAD19B]"
                            : "border-[#F4F1EA]/30 hover:border-[#F4F1EA]/60"
                        )}
                      >
                        {yearChecked && <Check size={10} className="text-[#2C473E]" strokeWidth={4} />}
                      </button>
                      <button
                        onClick={() => {
                          if (y !== year) {
                            onChange([], y);
                          } else {
                            toggleYear(y);
                          }
                        }}
                        className={cn(
                          "flex-1 text-left px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all tracking-tight",
                          isActive
                            ? "bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20"
                            : "text-[#EAD19B] hover:bg-[#EAD19B]/10"
                        )}
                      >
                        {y}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
