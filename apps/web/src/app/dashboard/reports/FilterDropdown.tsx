'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, RotateCcw, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';

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

  const months = [
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' },
  ];

  const currentYearNum = new Date().getFullYear();
  const years = [currentYearNum - 1, currentYearNum, currentYearNum + 1];

  const filteredOfficers = currentBranch
    ? officers.filter(o => (o.branch_id === currentBranch || o.branchId === currentBranch))
    : officers;

  return (
    <>
      {/* Left: Search Bar */}
      <div className="relative w-full md:w-80 group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-500 transition-colors" size={18} />
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Cari..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 focus:bg-white transition-all shadow-sm group-hover:border-slate-300"
        />
      </div>

      {/* Right: Filters & Reset */}
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
        {/* Branch Filter */}
        <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
          <select
            value={currentBranch}
            onChange={(e) => handleFilterChange('branch', e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="">RANTING: SEMUA</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name.replace(/ranting/gi, '').trim().toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Officer Filter */}
        <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
          <select
            value={currentOfficer}
            onChange={(e) => handleFilterChange('officer', e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="">PETUGAS: SEMUA</option>
            {filteredOfficers.map((o) => (
              <option key={o.id} value={o.id}>{(o.full_name || o.fullName).toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Combined Period Filter (Month & Year) */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
          <Calendar className="text-slate-400 ml-1.5" size={16} />
          <select
            value={currentMonth}
            onChange={(e) => handleFilterChange('month', e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-900 pl-1 pr-2 py-1.5 focus:outline-none cursor-pointer border-r border-slate-200"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => handleFilterChange('year', e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 focus:outline-none cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y.toString()}>{y}</option>
            ))}
          </select>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500 border-slate-200 hover:bg-slate-50 flex items-center gap-2 transition-all active:scale-95"
          onClick={handleReset}
        >
          <RotateCcw size={14} />
          RESET
        </Button>
      </div>
    </>
  );
}
