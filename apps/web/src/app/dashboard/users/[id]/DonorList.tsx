'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { LucideIcon } from 'lucide-react';

interface DonorListProps {
  title: string;
  donors: { owner_name: string; total: number }[];
  icon: LucideIcon;
  color: string;
  bg: string;
}

export function DonorList({ title, donors, icon: Icon, color, bg }: DonorListProps) {
  return (
    <Card variant="glass" className="relative overflow-hidden border-white/5 h-full">
      <div className="bg-white/3 -m-6 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`p-2 rounded-xl ${bg} ${color}`}>
            <Icon size={16} />
          </div>
          <h3 className="text-sm font-black text-[#F4F1EA] uppercase tracking-widest">{title}</h3>
        </div>

        {donors.length === 0 ? (
          <p className="text-xs text-[#F4F1EA]/40 font-medium">Belum ada data donasi</p>
        ) : (
          <div className="space-y-0">
            {donors.map((donor, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-2.5 px-1 ${
                  i < donors.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <span className="text-sm font-bold text-[#F4F1EA] truncate mr-3">
                  {donor.owner_name}
                </span>
                <span className="text-sm font-bold text-[#F4F1EA]/60 whitespace-nowrap tabular-nums">
                  Rp {donor.total.toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
