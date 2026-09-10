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
      <div className="w-20 h-20 bg-[#D97A76]/10 border border-[#D97A76]/30 rounded-full flex items-center justify-center mb-6">
        <AlertCircle size={40} className="text-[#D97A76]" aria-hidden="true" />
      </div>

      <h2 className="text-2xl font-bold text-[#F4F1EA] mb-2">Terjadi Kesalahan</h2>
      <p className="text-[#F4F1EA]/60 max-w-md mb-8">
        Maaf, sistem gagal memuat data. Hal ini mungkin disebabkan oleh masalah koneksi atau sesi yang berakhir.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => reset()}
          className="bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl shadow-lg shadow-[#EAD19B]/20"
        >
          <RefreshCcw size={18} className="mr-2" />
          Coba Lagi
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="rounded-xl w-full sm:w-auto border-[#F4F1EA]/20 text-[#F4F1EA] hover:bg-white/5">
            <Home size={18} className="mr-2" />
            Kembali ke Beranda
          </Button>
        </Link>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="mt-12 p-4 bg-black/30 border border-white/10 rounded-lg text-left overflow-auto max-w-2xl w-full">
          <p className="text-xs font-mono text-[#F4F1EA]/80 whitespace-pre-wrap">
            {error.message}
            {error.stack}
          </p>
        </div>
      )}
    </div>
  );
}
