'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircle } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Terjadi Kesalahan</h2>
      <p className="text-slate-500 mb-6 max-w-md">
        {error.message || 'Maaf, terjadi kesalahan saat memuat halaman ini. Silakan coba lagi.'}
      </p>
      <Button 
        onClick={() => reset()}
        className="bg-green-600 hover:bg-green-700"
      >
        Coba Lagi
      </Button>
    </div>
  );
}
