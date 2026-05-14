'use client';

import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './Button';
import { toast } from 'sonner';

interface ConfirmToastProps {
  id: string | number;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmToast({
  id,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  onConfirm,
  variant = 'danger'
}: ConfirmToastProps) {
  
  const iconMap = {
    danger: <AlertTriangle size={24} className="text-[#DE6F4A]" />,
    warning: <AlertTriangle size={24} className="text-[#EAD19B]" />,
    info: <Info size={24} className="text-emerald-400" />
  };

  const accentColor = variant === 'danger' ? 'border-[#DE6F4A]/30' : 'border-[#EAD19B]/30';

  return (
    <div className={`w-[350px] bg-[#2C473E]/95 backdrop-blur-2xl border ${accentColor} rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative group`}>
      {/* Decorative Glow */}
      <div className={`absolute -top-10 -right-10 w-24 h-24 blur-[50px] opacity-20 rounded-full ${variant === 'danger' ? 'bg-[#DE6F4A]' : 'bg-[#EAD19B]'}`} />
      
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl ${variant === 'danger' ? 'bg-[#DE6F4A]/10' : 'bg-[#EAD19B]/10'} border border-white/5 shadow-inner`}>
            {iconMap[variant]}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-[#F4F1EA] text-sm font-black uppercase tracking-widest">{title}</h3>
            <p className="text-[#F4F1EA]/60 text-[11px] leading-relaxed font-medium">
              {description}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toast.dismiss(id)}
            className="flex-1 h-10 rounded-xl text-[11px] font-bold text-[#F4F1EA]/40 hover:text-[#F4F1EA] hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toast.dismiss(id);
              onConfirm();
            }}
            className={`flex-1 h-10 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg ${
              variant === 'danger' 
                ? 'bg-[#DE6F4A] text-white hover:bg-[#DE6F4A]/90 shadow-[#DE6F4A]/20' 
                : 'bg-[#EAD19B] text-[#2C473E] hover:bg-[#EAD19B]/90 shadow-[#EAD19B]/20'
            }`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
