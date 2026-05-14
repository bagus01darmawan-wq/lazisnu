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
import { LogIn, Phone, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    resolver: zodResolver(loginSchema as any),
  });

  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0d1a15] relative overflow-hidden">
      {/* Deep Emerald Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-900/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-green-900/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />

      <Card className="w-full max-w-md relative z-10 p-8 shadow-2xl border-white/10 bg-white/5 backdrop-blur-2xl rounded-3xl">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-20 h-20 bg-linear-to-br from-green-500 to-emerald-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-green-900/40 mb-6 group transition-transform hover:rotate-3 duration-500">
            <LogIn className="text-white" size={40} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2 uppercase" style={{ fontFamily: 'Cambria, Georgia, serif' }}>
            LAZISNU
          </h1>
          <p className="text-emerald-500/80 font-bold tracking-[0.2em] text-xs uppercase">MWC Paninggaran</p>
        </div>

        <form 
          onSubmit={handleSubmit(onSubmit)} 
          className={cn(
            "space-y-6 transition-all duration-500",
            isLoading && "opacity-40 blur-[2px] pointer-events-none scale-[0.98]"
          )}
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3 animate-in fade-in zoom-in-95 duration-300">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="relative group">
              <LogIn className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-green-400 transition-colors z-10 pointer-events-none" size={18} />
              <Input
                {...register('identifier')}
                placeholder="Email atau Nomor HP"
                className="pl-12 h-14 bg-slate-900/50! border-white/10 focus:border-green-500/50 focus:ring-green-500/20 rounded-2xl transition-all text-white! placeholder:text-slate-500 caret-green-400 text-base autofill:shadow-[0_0_0_30px_#0f172a_inset] autofill:[-webkit-text-fill-color:white]"
                error={errors.identifier?.message}
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-green-400 transition-colors z-10 pointer-events-none" size={18} />
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="pl-12 pr-12 h-14 bg-slate-900/50! border-white/10 focus:border-green-500/50 focus:ring-green-500/20 rounded-2xl transition-all text-white! placeholder:text-slate-500 caret-green-400 text-base autofill:shadow-[0_0_0_30px_#0f172a_inset] autofill:[-webkit-text-fill-color:white]"
                error={errors.password?.message}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-green-400 transition-colors z-20"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-lg font-black bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 transition-all rounded-2xl shadow-xl shadow-green-900/20 active:scale-[0.98] duration-200"
            isLoading={isLoading}
          >
            MASUK SEKARANG
          </Button>
        </form>

        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-black">
            Infaq Management System
          </p>
        </div>
      </Card>
    </div>
  );
}
