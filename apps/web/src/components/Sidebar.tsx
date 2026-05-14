'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getMenuItems, UserRole } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { LogOut, User as UserIcon, Loader2 } from 'lucide-react';

interface SidebarProps {
  role?: UserRole;
  userName?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ role: initialRole, userName: initialUserName, isOpen, onClose }: SidebarProps) => {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  
  // Use store data or fallback to props
  const role = user?.role || initialRole;
  const userName = user?.full_name || initialUserName;

  if (!role) {
    return (
      <aside className={cn(
        "w-64 bg-slate-900 flex items-center justify-center h-screen fixed z-50 transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Loader2 className="animate-spin text-green-500" size={24} />
      </aside>
    );
  }

  const menuItems = getMenuItems(role);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-[#2C473E]/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "w-64 bg-[#F4F1EA] text-[#2C473E] flex flex-col h-screen fixed left-0 top-0 z-50 border-r border-[#2C473E]/5 shadow-2xl transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Brand Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-[#2C473E]/10 bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-[#2C473E] font-bold tracking-tight">LAZISNU</h1>
              <p className="text-[10px] text-[#2C473E]/50 uppercase tracking-widest font-bold">Collector Dashboard</p>
            </div>
          </div>
          
          {/* Close button for mobile */}
          <button 
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg hover:bg-[#2C473E]/5 text-[#2C473E]/50"
          >
            <LogOut className="rotate-180" size={20} />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose?.();
                }}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
                  isActive 
                    ? 'bg-[#DE6F4A]/10 text-[#DE6F4A] font-bold' 
                    : 'hover:bg-[#2C473E]/5 text-[#2C473E]/70 hover:text-[#2C473E]'
                )}
              >
                <Icon 
                  size={20} 
                  className={cn(
                    'transition-transform group-hover:scale-110',
                    isActive ? 'text-[#DE6F4A]' : 'text-[#2C473E]/40 group-hover:text-[#2C473E]'
                  )} 
                />
                <span className="text-sm">{item.title}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 bg-[#DE6F4A] rounded-full shadow-[0_0_8px_rgba(222,111,74,0.4)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Footer Section */}
        <div className="p-4 bg-[#F4F1EA] border-t border-[#2C473E]/10">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#2C473E]/5 border border-[#2C473E]/5 mb-3">
            <div className="w-10 h-10 bg-[#2C473E]/10 rounded-full flex items-center justify-center text-[#2C473E]">
              <UserIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#2C473E] truncate">{userName}</p>
              <p className="text-[10px] text-[#2C473E]/50 uppercase font-bold">{role.replace('_', ' ')}</p>
            </div>
          </div>
          
          <button 
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D97A76]/5 hover:bg-[#D97A76]/15 text-[#D97A76] transition-all duration-300 text-sm font-bold group border border-[#D97A76]/10 hover:border-[#D97A76]/30"
          >
            <LogOut size={18} className="transition-transform group-hover:-translate-x-1" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
