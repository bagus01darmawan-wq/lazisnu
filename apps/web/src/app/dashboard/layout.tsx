'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/store/useAuthStore';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Extract page title from pathname
  const pageTitle = pathname.split('/').pop()?.replace(/-/g, ' ') || 'Overview';

  return (
    <div className="flex bg-[#2C473E] min-h-screen overflow-x-hidden">
      <Sidebar 
        role={user?.role} 
        userName={user?.full_name} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      
      <main className={cn(
        "flex-1 min-h-screen flex flex-col transition-all duration-300 w-full",
        "lg:ml-64"
      )}>
        {/* Top Header */}
        <header className="h-16 bg-[#2C473E]/80 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#F4F1EA] transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[#F4F1EA]/70 text-xs md:text-sm font-medium hidden xs:block">Dashboard</span>
              <span className="text-[#F4F1EA]/50 hidden xs:block">/</span>
              <span className="text-[#F4F1EA] font-bold text-xs md:text-sm capitalize truncate max-w-[150px]">{pageTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
               <p className="text-xs font-bold text-[#F4F1EA]">{user?.full_name}</p>
               <p className="text-[10px] text-[#F4F1EA]/70 font-bold uppercase">{user?.role?.replace(/_/g, ' ')}</p>
             </div>
             <div className="w-8 h-8 md:w-9 md:h-9 bg-[#EAD19B] rounded-xl flex items-center justify-center text-[#2C473E] font-bold text-sm shadow-lg shadow-[#EAD19B]/20">
               {user?.full_name?.charAt(0).toUpperCase() || 'U'}
             </div>
          </div>
        </header>
        
        <div className="p-4 md:p-8 w-full max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
