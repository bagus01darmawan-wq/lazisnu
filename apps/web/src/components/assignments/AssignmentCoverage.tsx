'use client';

import { CheckCircle2, Clock, Layers, Users } from 'lucide-react';
import type { WorkQueueSummary } from './types';

interface AssignmentCoverageProps {
  summary: WorkQueueSummary | null;
  loading: boolean;
}

export function AssignmentCoverage({ summary, loading }: AssignmentCoverageProps) {
  if (loading || !summary) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-white/10" />
        <div className="mt-4 h-8 w-full rounded bg-white/10" />
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const assignable = summary.assignableCans;
  const coverage =
    assignable === 0
      ? 0
      : Math.round((summary.assignedAssignableCans / assignable) * 100);

  const stats = [
    {
      label: 'Dapat ditugaskan',
      value: summary.assignableCans,
      icon: Layers,
      tone: 'text-[#F4F1EA]',
    },
    {
      label: 'Sudah ditugaskan',
      value: summary.assignedAssignableCans,
      icon: CheckCircle2,
      tone: 'text-[#1F8243]',
    },
    {
      label: 'Belum ditugaskan',
      value: summary.unassignedAssignableCans,
      icon: Clock,
      tone: 'text-[#EAD19B]',
    },
    {
      label: 'Grup tersisa',
      value: summary.groupCount,
      icon: Users,
      tone: 'text-[#DE6F4A]',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5"
      aria-label="Ringkasan coverage penugasan"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
            Coverage penugasan
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#F4F1EA] md:text-3xl">
            {coverage}%
          </p>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#F4F1EA]/50">
          {summary.assignedAssignableCans}/{summary.assignableCans} kaleng
        </p>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#1F8243] transition-all duration-500"
          style={{ width: `${coverage}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5">
                <Icon size={12} className={stat.tone} />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#F4F1EA]/40">
                  {stat.label}
                </span>
              </div>
              <p className={`mt-1 text-xl font-black tracking-tight ${stat.tone}`}>
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {summary.nonAssignableCans > 0 && (
        <p className="mt-3 text-[10px] font-medium text-[#F4F1EA]/40">
          {summary.nonAssignableCans} kaleng non-aktif/dikembalikan tidak ikut penugasan.
        </p>
      )}
    </section>
  );
}
