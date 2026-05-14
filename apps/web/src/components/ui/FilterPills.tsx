'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FilterPillsProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterPills({ options, value, onChange, className }: FilterPillsProps) {
  const hasHeightClass = className?.includes('h-[');
  return (
    <div className={cn(
      "flex bg-[#F4F1EA]/10 p-1 rounded-2xl border border-[#F4F1EA]/20 backdrop-blur-md",
      !hasHeightClass && "h-[36px]",
      className
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          className={cn(
            "px-4 h-full rounded-xl text-[11px] font-bold transition-all duration-500",
            value === option.value
              ? "bg-[#DE6F4A] text-[#F4F1EA] shadow-lg shadow-[#DE6F4A]/20"
              : "text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/5"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
