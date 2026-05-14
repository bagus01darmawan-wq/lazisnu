'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  ChevronRight,
  ArrowLeft,
  MapPin,
  Loader2,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { DropdownFilter } from '@/components/ui/DropdownFilter';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { ConfirmToast } from '@/components/ui/ConfirmToast';
import { AlertTriangle } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
  _count?: {
    dukuhs: number;
    cans: number;
    officers: number;
  };
}

interface Dukuh {
  id: string;
  name: string;
  branchId: string;
}

export default function MasterDataPage() {
  const { user } = useAuthStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dukuhs, setDukuhs] = useState<Dukuh[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Modals state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDukuhModalOpen, setIsDukuhModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res: any = await api.get('/admin/branches');
      if (res.success) {
        setBranches(res.data);
      }
    } catch (error) {
      toast.error('Gagal mengambil data ranting');
    } finally {
      setLoading(false);
    }
  };

  const fetchDukuhs = async (branchId: string) => {
    try {
      setLoading(true);
      const res: any = await api.get(`/admin/branches/${branchId}/dukuhs`);
      if (res.success) {
        setDukuhs(res.data);
      }
    } catch (error) {
      toast.error('Gagal mengambil data dukuh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.patch(`/admin/branches/${editingItem.id}`, formData);
        toast.success('Ranting berhasil diperbarui');
      } else {
        await api.post('/admin/branches', formData);
        toast.success('Ranting berhasil ditambahkan');
      }
      setIsBranchModalOpen(false);
      setEditingItem(null);
      setFormData({ name: '', code: '' });
      fetchBranches();
    } catch (error: any) {
      const msg = error.error?.message || error.message || 'Terjadi kesalahan';
      toast.error(msg);
    }
  };

  const handleDukuhSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;
    try {
      if (editingItem) {
        await api.patch(`/admin/dukuhs/${editingItem.id}`, { name: formData.name });
        toast.success('Dukuh berhasil diperbarui');
      } else {
        await api.post(`/admin/branches/${selectedBranch.id}/dukuhs`, { name: formData.name });
        toast.success('Dukuh berhasil ditambahkan');
      }
      setIsDukuhModalOpen(false);
      setEditingItem(null);
      setFormData({ name: '', code: '' });
      fetchDukuhs(selectedBranch.id);
    } catch (error: any) {
      const msg = error.error?.message || error.message || 'Terjadi kesalahan';
      toast.error(msg);
    }
  };

  const handleDeleteBranch = async (id: string, name: string) => {
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={`Hapus Ranting ${name}?`}
        description="Ranting hanya bisa dihapus jika tidak memiliki dukuh, kaleng, atau petugas terkait."
        confirmLabel="Ya, Hapus"
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/branches/${id}`).then((res) => {
              fetchBranches();
              return res;
            }),
            {
              loading: 'Menghapus...',
              success: 'Ranting berhasil dihapus',
              error: (err: any) => err.response?.data?.error?.message || 'Gagal menghapus ranting',
            }
          );
        }}
      />
    ), { duration: 5000 });
  };

  const handleDeleteDukuh = async (id: string, name: string) => {
    (toast as any).custom((t: any) => (
      <ConfirmToast
        id={t}
        title={`Hapus Dukuh ${name}?`}
        description="Dukuh hanya bisa dihapus jika tidak memiliki kaleng terkait."
        confirmLabel="Ya, Hapus"
        onConfirm={() => {
          toast.promise(
            api.delete(`/admin/dukuhs/${id}`).then((res) => {
              if (selectedBranch) fetchDukuhs(selectedBranch.id);
              return res;
            }),
            {
              loading: 'Menghapus...',
              success: 'Dukuh berhasil dihapus',
              error: (err: any) => err.response?.data?.error?.message || 'Gagal menghapus dukuh',
            }
          );
        }}
      />
    ), { duration: 5000 });
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    b.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDukuhs = dukuhs.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeData = selectedBranch ? filteredDukuhs : filteredBranches;
  const totalItems = activeData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const pagedData = activeData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedBranch]);

  const branchColumns: any[] = [
    {
      header: 'Kode',
      accessorKey: 'code',
      cell: (info: any) => <span className="text-[10px] font-bold text-[#F4F1EA]/40 tracking-tight uppercase">{info.getValue()}</span>
    },
    {
      header: 'Nama Ranting',
      accessorKey: 'name',
      cell: (info: any) => <span className="font-bold text-[#F4F1EA]">{info.getValue()}</span>
    },
    {
      header: 'Aksi',
      id: 'actions',
      cell: (info: any) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 group"
              onClick={() => {
                setEditingItem(row);
                setFormData({ name: row.name, code: row.code });
                setIsBranchModalOpen(true);
              }}
            >
              <Edit size={14} className="text-[#EAD19B]" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#D97A76] hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300 group"
              onClick={() => handleDeleteBranch(row.id, row.name)}
            >
              <Trash2 size={14} className="text-[#F4F1EA]/40 group-hover:text-[#D97A76]" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-3 rounded-xl hover:bg-white/10 text-[#EAD19B] flex items-center gap-1 group transition-all duration-300"
              onClick={() => {
                setSelectedBranch(row);
                setSearch('');
                fetchDukuhs(row.id);
              }}
            >
              <span className="text-[11px] font-bold uppercase tracking-tight">Kelola Dukuh</span>
              <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        );
      }
    }
  ];

  const dukuhColumns: any[] = [
    {
      header: 'Nama Dukuh',
      accessorKey: 'name',
      cell: (info: any) => <span className="font-bold text-[#F4F1EA]">{info.getValue()}</span>
    },
    {
      header: 'Aksi',
      id: 'actions',
      cell: (info: any) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/10 transition-all duration-300 group"
              onClick={() => {
                setEditingItem(row);
                setFormData({ name: row.name, code: '' });
                setIsDukuhModalOpen(true);
              }}
            >
              <Edit size={14} className="text-[#EAD19B]" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-xl border-white/10 bg-white/5 text-[#F4F1EA]/60 hover:text-[#D97A76] hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300 group"
              onClick={() => handleDeleteDukuh(row.id, row.name)}
            >
              <Trash2 size={14} className="text-[#F4F1EA]/40 group-hover:text-[#D97A76]" />
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedBranch ? (
            <button 
              onClick={() => {
                setSelectedBranch(null);
                setSearch('');
              }}
              className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-[#F4F1EA] hover:bg-white/20 transition-all shadow-lg active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Database className="text-[#EAD19B]" size={28} />
          )}
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">
              {selectedBranch ? `Dukuh: ${selectedBranch.name}` : 'Data Master'}
            </h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">
              {selectedBranch 
                ? `Manajemen daftar dukuh di wilayah ${selectedBranch.name}`
                : 'Kelola informasi wilayah Ranting dan Dukuh.'}
            </p>
          </div>
        </div>
        
        {/* Primary Action Button */}
        <Button 
          onClick={() => {
            setEditingItem(null);
            setFormData({ name: '', code: '' });
            if (selectedBranch) setIsDukuhModalOpen(true);
            else setIsBranchModalOpen(true);
          }}
          className="h-[35px] px-4 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus size={14} strokeWidth={3} />
          {selectedBranch ? 'Tambah Dukuh' : 'Tambah Ranting'}
        </Button>
      </div>

      {/* Transparent Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-transparent p-4 border-none shadow-none">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-[160px] group">
            <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
              <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
                <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
              </div>
              <input
                type="text"
                placeholder="Cari..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-[#F4F1EA]/60 focus:outline-none"
              />
            </div>
          </div>

          <DropdownFilter 
            options={[
              { label: '10', value: '10' },
              { label: '20', value: '20' },
              { label: '50', value: '50' }
            ]}
            value={pageSize.toString()}
            onChange={(val) => {
              setPageSize(Number(val));
              setCurrentPage(1);
            }}
            className="min-w-[80px]! h-[36px]"
            popoverWidth="w-full"
            showSearch={false}
          />
        </div>
      </div>

      {/* Content wrapped in Glass Card */}
      <Card variant="glass" className="p-0 border-white/5 shadow-2xl overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto w-full custom-scrollbar">
          {selectedBranch ? (
            <Table 
              columns={dukuhColumns} 
              data={pagedData as any[]} 
              loading={loading}
              variant="glass"
            />
          ) : (
            <Table 
              columns={branchColumns} 
              data={pagedData as any[]} 
              loading={loading}
              variant="glass"
            />
          )}
        </div>
        
        {/* Smart Pagination Control - Standardized */}
        {!loading && totalItems > 0 && (
          <div className="px-6 py-5 bg-white/5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Summary Info Badge */}
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm px-4 h-10">
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Menampilkan</span>
              <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                <span className="text-xs font-black text-[#EAD19B]">{pagedData.length}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
              <div className="min-w-[32px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                <span className="text-xs font-black text-[#F4F1EA]">{totalItems}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight ml-1">{selectedBranch ? 'Dukuh' : 'Ranting'}</span>
            </div>

            {/* Right: Smart Control Pill */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-sm transition-all hover:shadow-md">
              {/* Page Info Badge */}
              <div className="px-4 flex items-center gap-1.5 min-w-[140px] justify-center">
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">Halaman</span>
                <div className="w-6 h-6 flex items-center justify-center bg-[#EAD19B]/10 rounded-lg">
                  <span className="text-xs font-black text-[#EAD19B]">{currentPage}</span>
                </div>
                <span className="text-[10px] font-bold text-[#F4F1EA]/40 uppercase tracking-tight">dari</span>
                <div className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-[#F4F1EA]/5 rounded-lg border border-white/10">
                  <span className="text-xs font-black text-[#F4F1EA]">{totalPages || 1}</span>
                </div>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="w-8 h-8 p-0 rounded-xl hover:bg-white/10 text-[#F4F1EA] transition-colors disabled:opacity-10"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {!loading && totalItems === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-[#F4F1EA]/20">
            <MapPin size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium tracking-tight">Tidak ada data ditemukan</p>
          </div>
        )}
      </Card>

      {/* Branch Modal */}
      <Modal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        title={editingItem ? 'Edit Ranting' : 'Tambah Ranting Baru'}
      >
        <form onSubmit={handleBranchSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider ml-1">Kode Ranting</label>
            <input 
              type="text" 
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all font-medium text-slate-900"
              placeholder="Misal: RTG01"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider ml-1">Nama Ranting</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all font-medium text-slate-900"
              placeholder="Nama Desa/Kelurahan"
              required
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => setIsBranchModalOpen(false)}
              className="flex-1"
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
            >
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Dukuh Modal */}
      <Modal
        isOpen={isDukuhModalOpen}
        onClose={() => setIsDukuhModalOpen(false)}
        title={editingItem ? 'Edit Dukuh' : 'Tambah Dukuh Baru'}
      >
        <div className="mb-4">
           <p className="text-sm text-slate-500 mt-1">Ranting: <span className="font-bold text-green-600">{selectedBranch?.name}</span></p>
        </div>
        
        <form onSubmit={handleDukuhSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider ml-1">Nama Dukuh/Dusun</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all font-medium text-slate-900"
              placeholder="Misal: Dusun Krajan"
              required
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => setIsDukuhModalOpen(false)}
              className="flex-1"
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] font-bold rounded-xl h-11 shadow-lg shadow-[#EAD19B]/20"
            >
              Simpan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
