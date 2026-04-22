'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in zoom-in duration-300">
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
        <AlertCircle size={40} className="text-red-500" />
      </div>
      
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Terjadi Kesalahan</h2>
      <p className="text-slate-500 max-w-md mb-8">
        Maaf, sistem gagal memuat data. Hal ini mungkin disebabkan oleh masalah koneksi atau sesi yang berakhir.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button 
          onClick={() => reset()} 
          className="bg-slate-900 hover:bg-slate-800 rounded-xl"
        >
          <RefreshCcw size={18} className="mr-2" />
          Coba Lagi
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="rounded-xl w-full sm:w-auto">
            <Home size={18} className="mr-2" />
            Kembali ke Beranda
          </Button>
        </Link>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="mt-12 p-4 bg-slate-100 rounded-lg text-left overflow-auto max-w-2xl w-full">
          <p className="text-xs font-mono text-slate-600 whitespace-pre-wrap">
            {error.message}
            {error.stack}
          </p>
        </div>
      )}
    </div>
  );
}
