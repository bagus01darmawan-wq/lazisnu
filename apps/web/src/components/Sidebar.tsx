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
}

const Sidebar = ({ role: initialRole, userName: initialUserName }: SidebarProps) => {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  
  // Use store data or fallback to props
  const role = user?.role || initialRole;
  const userName = user?.full_name || initialUserName;

  if (!role) {
    return (
      <aside className="w-64 bg-slate-900 flex items-center justify-center h-screen fixed">
        <Loader2 className="animate-spin text-green-500" size={24} />
      </aside>
    );
  }

  const menuItems = getMenuItems(role);

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-40 border-r border-slate-800 shadow-xl">
      {/* Brand Header */}
      <div className="h-20 flex items-center px-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-900/20">
            <span className="text-white font-bold text-xl">L</span>
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tight">LAZISNU</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Collector Dashboard</p>
          </div>
        </div>
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
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
                isActive 
                  ? 'bg-green-600/10 text-green-500 font-semibold' 
                  : 'hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon 
                size={20} 
                className={cn(
                  'transition-transform group-hover:scale-110',
                  isActive ? 'text-green-500' : 'text-slate-500 group-hover:text-white'
                )} 
              />
              <span className="text-sm">{item.title}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer Section */}
      <div className="p-4 bg-slate-900/80 border-t border-slate-800">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 mb-3">
          <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-slate-300">
            <UserIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{userName}</p>
            <p className="text-[10px] text-slate-500 uppercase font-bold">{role.replace('_', ' ')}</p>
          </div>
        </div>
        
        <button 
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-900/20 hover:text-red-500 transition-all duration-300 text-sm font-semibold group"
        >
          <LogOut size={18} className="transition-transform group-hover:-translate-x-1" />
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
