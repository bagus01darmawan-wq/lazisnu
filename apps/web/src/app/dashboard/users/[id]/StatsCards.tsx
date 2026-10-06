'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Wallet, ClipboardList, CheckCircle, TrendingUp, Calculator, AlertCircle } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    totalCollections: number;
    totalAmount: number;
    totalAssignments: number;
    completedAssignments: number;
    activeAssignments: number;
    uncollectedAssignments: number;
    completionRate: number;
    averagePerCollection: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: 'Total Penjemputan',
      value: stats.totalCollections.toLocaleString('id-ID'),
      sub: 'kali penjemputan',
      icon: ClipboardList,
      color: 'text-[#6B9E9F]',
      bg: 'bg-[#6B9E9F]/10',
    },
    {
      label: 'Total Nominal',
      value: `Rp ${stats.totalAmount.toLocaleString('id-ID')}`,
      sub: 'terkumpul',
      icon: Wallet,
      color: 'text-[#EAD19B]',
      bg: 'bg-[#EAD19B]/10',
    },
    {
      label: 'Total Tugas',
      value: stats.totalAssignments.toLocaleString('id-ID'),
      sub: `${stats.completedAssignments} selesai · ${stats.activeAssignments} aktif · ${stats.uncollectedAssignments} terlewat`,
      icon: CheckCircle,
      color: 'text-[#DE6F4A]',
      bg: 'bg-[#DE6F4A]/10',
    },
    {
      label: 'Tingkat Penyelesaian',
      value: `${stats.completionRate}%`,
      sub: 'dari total tugas',
      icon: TrendingUp,
      color: 'text-[#1F8243]',
      bg: 'bg-[#1F8243]/10',
    },
    {
      label: 'Rata-rata per Jemput',
      value: `Rp ${stats.averagePerCollection.toLocaleString('id-ID')}`,
      sub: 'nominal rata-rata',
      icon: Calculator,
      color: 'text-[#F59E0B]',
      bg: 'bg-[#F59E0B]/10',
    },
    {
      label: 'Kaleng Terlewat',
      value: stats.uncollectedAssignments.toLocaleString('id-ID'),
      sub: 'status tidak terjemput',
      icon: AlertCircle,
      color: 'text-[#F59E0B]',
      bg: 'bg-[#F59E0B]/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} variant="glass" className="relative overflow-hidden group border-white/5">
            <div className="bg-white/3 -m-6 p-6">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#F4F1EA]/50 uppercase tracking-widest">{card.label}</p>
                  <h3 className="text-xl font-black text-[#F4F1EA] mt-1.5 tracking-tight truncate">
                    {card.value}
                  </h3>
                </div>
                <div className={`p-2.5 rounded-2xl ${card.bg} ${card.color} transition-all duration-500`}>
                  <Icon size={20} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">
                  {card.sub}
                </span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
