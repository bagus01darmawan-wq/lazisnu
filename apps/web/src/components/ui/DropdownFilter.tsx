'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropdownFilterProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  showSearch?: boolean;
  layout?: 'vertical' | 'horizontal';
  popoverWidth?: string;
}

export function DropdownFilter({
  options,
  value,
  onChange,
  placeholder = "Filter...",
  label,
  icon,
  className,
  showSearch = true,
  layout = 'vertical',
  popoverWidth = 'w-64'
}: DropdownFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    setActiveIndex(-1);
  }, [search, isOpen]);

  // Handle auto-scroll when activeIndex changes
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[activeIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
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

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          onChange(filteredOptions[activeIndex].value);
          setIsOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const hasHeightClass = className?.includes('h-[');

  return (
    <div
      className={cn("relative", !hasHeightClass && "h-[36px]", className)}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 h-full bg-[#F4F1EA]/10 border border-[#F4F1EA]/20 backdrop-blur-md rounded-2xl text-[11px] font-bold text-[#F4F1EA] hover:bg-[#F4F1EA]/20 transition-all min-w-[140px]",
          isOpen && "bg-[#F4F1EA]/20 ring-1 ring-[#EAD19B]/30"
        )}
      >
        {icon || <Filter size={14} className="text-[#EAD19B]" />}
        <span className="truncate max-w-[120px]">
          {selectedOption ? selectedOption.label : label || placeholder}
        </span>
        <ChevronDown size={14} className={cn("ml-auto transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute top-full mt-3 left-0 bg-[#F4F1EA]/10 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-300",
          layout === 'vertical' ? popoverWidth : "w-auto min-w-max"
        )}>
          {showSearch && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#DE6F4A]/60" size={14} />
              <input
                placeholder="Cari..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-black/5 border border-[#DE6F4A]/10 rounded-xl text-xs text-[#DE6F4A] placeholder:text-[#DE6F4A]/40 focus:ring-1 focus:ring-[#DE6F4A]/30 outline-none"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#F4F1EA]/30 hover:text-[#F4F1EA]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div
            className={cn(
              "max-h-48 overflow-y-auto custom-scrollbar gap-1",
              layout === 'vertical' ? "space-y-1" : "flex flex-row items-center"
            )}
            ref={listRef}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "text-left px-3 py-2 rounded-lg text-xs transition-all font-semibold whitespace-nowrap flex items-center justify-between",
                    layout === 'vertical' ? "w-full" : "min-w-[40px] text-center",
                    activeIndex === index
                      ? "bg-[#DE6F4A]/80 text-white shadow-lg shadow-[#DE6F4A]/20"
                      : value === option.value
                        ? "bg-[#DE6F4A] text-white"
                        : "text-[#DE6F4A] hover:bg-[#DE6F4A] hover:text-white"
                  )}
                >
                  <span>{option.label}</span>
                  {value === option.value && <Check size={12} className={cn("ml-2 shrink-0", activeIndex === index ? "text-white" : "text-white")} />}
                </button>
              ))
            ) : (
              <p className="text-[10px] text-center py-2 text-[#F4F1EA]/40 font-medium">Data tidak ditemukan</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
