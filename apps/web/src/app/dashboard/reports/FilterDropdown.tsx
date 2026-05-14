'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, RotateCcw, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { PeriodPicker } from '@/components/ui/PeriodPicker';

export default function FilterDropdown() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentMonth = searchParams.get('month') || (new Date().getMonth() + 1).toString();
  const currentYear = searchParams.get('year') || new Date().getFullYear().toString();
  const currentBranch = searchParams.get('branch') || '';
  const currentOfficer = searchParams.get('officer') || '';
  const initialSearch = searchParams.get('search') || '';

  const [branches, setBranches] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearch);

  // Fetch branches and officers
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [branchesRes, officersRes] = await Promise.all([
          api.get('/admin/branches'),
          api.get('/admin/officers', { params: { is_active: true } })
        ]);
        if ((branchesRes as any).success) setBranches((branchesRes as any).data || []);
        if ((officersRes as any).success) {
          const rawOfficers = (officersRes as any).data.items || (officersRes as any).data || [];
          setOfficers(rawOfficers);
        }
      } catch (error) {
        console.error('Failed to fetch filter data:', error);
      }
    };
    fetchDropdownData();
  }, []);

  const updateUrl = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      params.delete('page'); // Reset pagination
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (debouncedSearchTerm !== (searchParams.get('search') || '')) {
      updateUrl({ search: debouncedSearchTerm });
    }
  }, [debouncedSearchTerm, updateUrl, searchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (type: string, value: string) => {
    const updates: Record<string, string> = { [type]: value };

    if (type === 'branch' && value) {
      updates['branch'] = value;
      const currentOfficerData = officers.find(o => o.id === currentOfficer);
      const officerBranchId = currentOfficerData?.branch_id || currentOfficerData?.branchId;
      if (officerBranchId !== value) {
        updates['officer'] = ''; // Clear officer if branch mismatch
      }
    }

    if (type === 'officer' && value) {
      const selectedOfficer = officers.find(o => o.id === value);
      const officerBranchId = selectedOfficer?.branch_id || selectedOfficer?.branchId;
      if (officerBranchId) {
        updates['branch'] = officerBranchId; // Auto-select branch
      }
    }

    updateUrl(updates);
  };

  const handleReset = () => {
    setSearchTerm('');
    const params = new URLSearchParams();
    params.set('month', (new Date().getMonth() + 1).toString());
    params.set('year', new Date().getFullYear().toString());
    router.push(`?${params.toString()}`);
  };


  const filteredOfficers = currentBranch
    ? officers.filter(o => (o.branch_id === currentBranch || o.branchId === currentBranch))
    : officers;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center justify-between w-full">
      {/* Left: Compact Search Bar (160px) */}
      <div className="relative w-[160px] group">
        <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
          <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
            <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Cari..."
            className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
          />
        </div>
      </div>

      {/* Right: Filters & Actions */}
      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
        {/* Branch Filter */}
        <DropdownFilter
          label="Pilih Ranting"
          placeholder="Cari ranting..."
          options={[
            { label: 'RANTING: SEMUA', value: '' },
            ...branches.map((b) => ({
              label: b.name.replace(/ranting/gi, '').trim().toUpperCase(),
              value: b.id
            }))
          ]}
          value={currentBranch}
          onChange={(val) => handleFilterChange('branch', val)}
          className="h-[36px]"
        />

        {/* Officer Filter */}
        <DropdownFilter
          label="Pilih Petugas"
          placeholder="Cari petugas..."
          options={[
            { label: 'PETUGAS: SEMUA', value: '' },
            ...filteredOfficers.map((o) => ({
              label: (o.full_name || o.fullName).toUpperCase(),
              value: o.id
            }))
          ]}
          value={currentOfficer}
          onChange={(val) => handleFilterChange('officer', val)}
          className="h-[36px]"
        />

        {/* Period Filter Pill Wrapper */}
        <PeriodPicker
          month={Number(currentMonth)}
          year={Number(currentYear)}
          onChange={(m, y) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('month', m.toString());
            params.set('year', y.toString());
            params.delete('page');
            router.push(`?${params.toString()}`);
          }}
        />

        <DropdownFilter
          options={[
            { label: '10', value: '10' },
            { label: '20', value: '20' },
            { label: '50', value: '50' },
            { label: '100', value: '100' }
          ]}
          value={searchParams.get('limit') || '10'}
          onChange={(val) => handleFilterChange('limit', val)}
          className="min-w-[80px]! h-[36px]"
          popoverWidth="w-full"
          showSearch={false}
        />

        <button
          onClick={handleReset}
          className="h-[36px] bg-[#F4F1EA]/10 backdrop-blur-md border border-[#F4F1EA]/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white/90 hover:bg-[#F4F1EA]/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
        >
          <RotateCcw size={14} strokeWidth={3} className="text-[#EAD19B]" />
          Reset
        </button>
      </div>
    </div>
  );
}
