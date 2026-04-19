'use client';

import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/store/useAuthStore';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  const pathname = usePathname();

  // Extract page title from pathname
  const pageTitle = pathname.split('/').pop()?.replace(/-/g, ' ') || 'Overview';

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar role={user?.role} userName={user?.full_name} />
      <main className="flex-1 ml-64 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="h-16 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm font-medium">Dashboard</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-bold text-sm capitalize">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
               <p className="text-xs font-bold text-slate-900">{user?.full_name}</p>
               <p className="text-[10px] text-slate-500 font-bold uppercase">{user?.role?.replace(/_/g, ' ')}</p>
             </div>
          </div>
        </header>
        
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
