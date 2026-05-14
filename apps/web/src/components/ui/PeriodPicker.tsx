'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PeriodPickerProps {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  className?: string;
}

const months = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function PeriodPicker({ month, year, onChange, className }: PeriodPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          {months[month - 1]} {year}
        </span>
        <ChevronDown size={14} className={cn("ml-1 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-3 left-0 bg-[#F4F1EA]/10 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-300 min-w-[280px]">
          <div className="grid grid-cols-2 gap-4">
            {/* Months Column */}
            <div className="space-y-1">
              <p className="text-[9px] font-black text-[#F4F1EA]/30 uppercase tracking-[0.2em] mb-2 px-2">Bulan</p>
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                {months.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => {
                      onChange(i + 1, year);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight",
                      month === i + 1
                        ? "bg-[#DE6F4A] text-white shadow-lg shadow-[#DE6F4A]/20"
                        : "text-[#DE6F4A] hover:bg-[#DE6F4A]/10"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Years Column */}
            <div className="space-y-1 border-l border-white/5 pl-3">
              <p className="text-[9px] font-black text-[#F4F1EA]/30 uppercase tracking-[0.2em] mb-2 px-2">Tahun</p>
              <div className="space-y-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => {
                      onChange(month, y);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all tracking-tight",
                      year === y
                        ? "bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20"
                        : "text-[#EAD19B] hover:bg-[#EAD19B]/10"
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
