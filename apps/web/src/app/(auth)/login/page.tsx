'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { authHelper } from '@/lib/auth';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import Cookies from 'js-cookie';
import { LogIn, Phone, Lock, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  identifier: z.string().min(3, 'Email atau Nomor HP minimal 3 karakter'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const response: any = await api.post('/auth/login', data);

      if (response.success) {
        authHelper.setToken(response.data.access_token);
        if (response.data.refresh_token) {
          authHelper.setRefreshToken(response.data.refresh_token);
        }
        setUser(response.data.user);

        // Redirect to dashboard
        router.push('/dashboard/overview');
      } else {
        setError(response.error?.message || 'Login gagal, silakan coba lagi');
      }
    } catch (err: any) {
      setError(err.error?.message || 'Terjadi kesalahan koneksi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/50 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-300/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-md relative z-10 p-8 shadow-2xl border-white/40 bg-white/70 backdrop-blur-xl rounded-3xl">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-600/20 mb-6 group transition-transform hover:scale-105 duration-300">
            <LogIn className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Selamat Datang
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Dashboard Lazisnu MWC Paninggaran</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="relative group">
              <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-600 transition-colors z-10" size={18} />
              <Input
                {...register('identifier')}
                placeholder="Email atau Nomor HP"
                className="pl-10 h-12 bg-white/80 border-slate-200 focus:border-green-500 rounded-xl transition-all text-slate-900"
                error={errors.identifier?.message}
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-600 transition-colors z-10" size={18} />
              <Input
                {...register('password')}
                type="password"
                placeholder="Password"
                className="pl-10 h-12 bg-white/80 border-slate-200 focus:border-green-500 rounded-xl transition-all text-slate-900"
                error={errors.password?.message}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 transition-all rounded-xl shadow-lg shadow-green-600/20"
            isLoading={isLoading}
          >
            Masuk Sekarang
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-400 uppercase tracking-widest font-bold">
            Lazisnu Infaq System
          </p>
        </div>
      </Card>
    </div>
  );
}
