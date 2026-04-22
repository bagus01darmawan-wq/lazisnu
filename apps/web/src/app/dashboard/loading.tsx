import React from 'react';
import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full">
      <div className="relative">
        {/* Outer pulsating ring */}
        <div className="absolute inset-0 border-4 border-green-100 rounded-full animate-ping"></div>
        {/* Inner spinning loader */}
        <Loader2 className="w-12 h-12 text-green-600 animate-spin relative z-10" />
      </div>
      <p className="mt-6 text-sm font-medium text-slate-500 animate-pulse">Memuat data...</p>
    </div>
  );
}
