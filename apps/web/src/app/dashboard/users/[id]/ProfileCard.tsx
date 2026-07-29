'use client';

import React from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { MapPin, Phone, Calendar, UserCheck, UserX, Briefcase, Hash } from 'lucide-react';

interface ProfileCardProps {
  officer: {
    id: string;
    employee_code: string;
    full_name: string;
    phone: string;
    photo_url?: string;
    assigned_zone?: string;
    is_active: boolean;
    created_at?: string;
    branch?: { name: string } | null;
    district?: { name: string } | null;
  };
}

export function ProfileCard({ officer }: ProfileCardProps) {
  const initials = officer.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const formattedDate = officer.created_at
    ? new Date(officer.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  return (
    <Card variant="glass" className="relative overflow-hidden">
      <div className="bg-white/3 -m-6 p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-shrink-0">
            {officer.photo_url ? (
              <Image
                src={officer.photo_url}
                alt={officer.full_name}
                width={96}
                height={96}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-white/10"
                unoptimized
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#DE6F4A] to-[#EAD19B] flex items-center justify-center text-[#2C473E] text-2xl font-black border-2 border-white/10">
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-4">
              <h1 className="text-2xl font-black text-[#F4F1EA] tracking-tight truncate">
                {officer.full_name}
              </h1>
              <span className={`
                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest w-fit
                ${officer.is_active
                  ? 'bg-[#1F8243]/15 text-[#1F8243] border border-[#1F8243]/20'
                  : 'bg-[#F4F1EA]/10 text-[#F4F1EA]/60 border border-white/10'
                }
              `}>
                {officer.is_active ? (
                  <><UserCheck size={12} /> Aktif</>
                ) : (
                  <><UserX size={12} /> Non-Aktif</>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#DE6F4A]/10 text-[#DE6F4A]">
                  <Hash size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">ID Petugas</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{officer.employee_code}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#6B9E9F]/10 text-[#6B9E9F]">
                  <Phone size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">Nomor HP</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{officer.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#EAD19B]/10 text-[#EAD19B]">
                  <Briefcase size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">Ranting</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{officer.branch?.name || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#DE6F4A]/10 text-[#DE6F4A]">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">Kecamatan</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{officer.district?.name || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#6B9E9F]/10 text-[#6B9E9F]">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">Wilayah Tugas</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{officer.assigned_zone || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#EAD19B]/10 text-[#EAD19B]">
                  <Calendar size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-wider">Bergabung</p>
                  <p className="text-sm font-bold text-[#F4F1EA]">{formattedDate}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
