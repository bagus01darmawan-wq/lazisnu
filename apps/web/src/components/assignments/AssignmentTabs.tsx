'use client';

import { History, LayoutList } from 'lucide-react';
import type { AssignmentTab } from './types';

interface AssignmentTabsProps {
  activeTab: AssignmentTab;
  onChange: (tab: AssignmentTab) => void;
  historyCount?: number;
}

const TABS: { id: AssignmentTab; label: string; icon: typeof LayoutList }[] = [
  { id: 'kelola', label: 'Kelola', icon: LayoutList },
  { id: 'riwayat', label: 'Riwayat', icon: History },
];

export function AssignmentTabs({ activeTab, onChange, historyCount }: AssignmentTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Mode halaman penugasan"
      className="flex w-full gap-1 rounded-2xl border border-white/10 bg-white/5 p-1"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`assignment-panel-${tab.id}`}
            id={`assignment-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
              active
                ? 'bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20'
                : 'text-[#F4F1EA]/50 hover:bg-white/5 hover:text-[#F4F1EA]'
            }`}
          >
            <Icon size={14} />
            {tab.label}
            {tab.id === 'riwayat' && typeof historyCount === 'number' && historyCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                  active ? 'bg-[#2C473E]/10 text-[#2C473E]' : 'bg-white/10 text-[#F4F1EA]/60'
                }`}
              >
                {historyCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
