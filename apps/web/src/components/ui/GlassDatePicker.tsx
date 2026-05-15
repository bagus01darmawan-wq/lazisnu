'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlassDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  max?: string;
  min?: string;
}

export function GlassDatePicker({
  value,
  onChange,
  label,
  placeholder = 'Pilih tanggal...',
  className,
  max,
  min,
}: GlassDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value && !selectedDate) {
      setSelectedDate(parse(value, 'yyyy-MM-dd', new Date()));
    }
  }, [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      const formatted = format(date, 'yyyy-MM-dd');
      onChange(formatted);
      setIsOpen(false);
    }
  };

  const displayValue = selectedDate
    ? format(selectedDate, 'dd MMM yyyy', { locale: id })
    : '';

  return (
    <div className={cn('w-full space-y-1.5', className)} ref={containerRef}>
      {label && (
        <label className="text-sm font-semibold text-[#F4F1EA]/60">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-2 px-3 h-11 w-full rounded-xl border text-sm font-medium transition-all outline-none',
            'bg-white/[0.03] border-white/10 text-[#F4F1EA]',
            'focus:ring-2 focus:ring-[#EAD19B]/30 focus:border-[#EAD19B]/50',
            isOpen && 'ring-2 ring-[#EAD19B]/30 border-[#EAD19B]/50'
          )}
        >
          <Calendar size={16} className="text-[#EAD19B] shrink-0" />
          <span className={cn('flex-1 text-left', !displayValue && 'text-[#F4F1EA]/40')}>
            {displayValue || placeholder}
          </span>
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 transition-transform duration-300 text-[#F4F1EA]/40',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full mt-2 left-0 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-[#F4F1EA]/10 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] overflow-hidden p-3">
              <style>{`
                .rdp {
                  --rdp-cell-size: 36px;
                  --rdp-accent-color: #EAD19B;
                  --rdp-background-color: rgba(234, 209, 155, 0.15);
                  margin: 0;
                }
                .rdp-months { display: flex; gap: 1rem; }
                .rdp-month { background: transparent; }
                .rdp-caption {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0 0.5rem;
                  margin-bottom: 0.5rem;
                }
                .rdp-caption_label {
                  font-size: 13px;
                  font-weight: 700;
                  color: #F4F1EA;
                  font-family: inherit;
                }
                .rdp-nav {
                  display: flex;
                  gap: 0.25rem;
                }
                .rdp-nav_button {
                  width: 28px;
                  height: 28px;
                  border-radius: 8px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: transparent;
                  border: 1px solid rgba(255,255,255,0.1);
                  color: #F4F1EA;
                  cursor: pointer;
                  transition: all 0.2s;
                }
                .rdp-nav_button:hover {
                  background: rgba(255,255,255,0.1);
                }
                .rdp-head_cell {
                  font-size: 10px;
                  font-weight: 700;
                  color: rgba(244,241,234,0.4);
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                }
                .rdp-cell {
                  width: var(--rdp-cell-size);
                  height: var(--rdp-cell-size);
                  text-align: center;
                  padding: 0;
                }
                .rdp-day {
                  width: 100%;
                  height: 100%;
                  border-radius: 8px;
                  font-size: 12px;
                  font-weight: 600;
                  color: rgba(244,241,234,0.7);
                  background: transparent;
                  border: none;
                  cursor: pointer;
                  transition: all 0.2s;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .rdp-day:hover:not([disabled]) {
                  background: rgba(255,255,255,0.1);
                  color: #F4F1EA;
                }
                .rdp-day_selected {
                  background: #EAD19B !important;
                  color: #2C473E !important;
                  font-weight: 700;
                }
                .rdp-day_today {
                  background: rgba(222, 111, 74, 0.15);
                  color: #DE6F4A;
                  font-weight: 700;
                }
                .rdp-day_outside { opacity: 0.3; }
                .rdp-day_disabled { opacity: 0.2; cursor: not-allowed; }
                .rdp-table { width: 100%; border-collapse: collapse; }
              `}</style>
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                locale={id}
                showOutsideDays
                fixedWeeks
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
