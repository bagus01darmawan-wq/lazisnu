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
import { toast } from 'react-hot-toast';

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
    if (!confirm(`Hapus ranting ${name}? Ranting hanya bisa dihapus jika tidak memiliki dukuh, kaleng, atau petugas terkait.`)) return;
    try {
      await api.delete(`/admin/branches/${id}`);
      toast.success('Ranting berhasil dihapus');
      fetchBranches();
    } catch (error: any) {
      const msg = error.error?.message || error.message || 'Gagal menghapus ranting';
      toast.error(msg);
    }
  };

  const handleDeleteDukuh = async (id: string, name: string) => {
    if (!confirm(`Hapus dukuh ${name}? Dukuh hanya bisa dihapus jika tidak memiliki kaleng terkait.`)) return;
    try {
      await api.delete(`/admin/dukuhs/${id}`);
      toast.success('Dukuh berhasil dihapus');
      if (selectedBranch) fetchDukuhs(selectedBranch.id);
    } catch (error: any) {
      const msg = error.error?.message || error.message || 'Gagal menghapus dukuh';
      toast.error(msg);
    }
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
      cell: (info: any) => <span className="font-mono font-bold text-slate-600">{info.getValue()}</span>
    },
    {
      header: 'Nama Ranting',
      accessorKey: 'name',
      cell: (info: any) => <span className="font-bold text-slate-900">{info.getValue()}</span>
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
              className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200 group"
              onClick={() => {
                setEditingItem(row);
                setFormData({ name: row.name, code: row.code });
                setIsBranchModalOpen(true);
              }}
            >
              <Edit size={14} className="text-slate-500 group-hover:text-green-600" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all border-slate-200 group"
              onClick={() => handleDeleteBranch(row.id, row.name)}
            >
              <Trash2 size={14} className="text-slate-500 group-hover:text-red-600" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 rounded-lg hover:bg-green-50 text-green-600 flex items-center gap-1 group"
              onClick={() => {
                setSelectedBranch(row);
                setSearch('');
                fetchDukuhs(row.id);
              }}
            >
              <span className="text-xs font-bold">Kelola Dukuh</span>
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
      cell: (info: any) => <span className="font-bold text-slate-900">{info.getValue()}</span>
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
              className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200 group"
              onClick={() => {
                setEditingItem(row);
                setFormData({ name: row.name, code: '' });
                setIsDukuhModalOpen(true);
              }}
            >
              <Edit size={14} className="text-slate-500 group-hover:text-green-600" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all border-slate-200 group"
              onClick={() => handleDeleteDukuh(row.id, row.name)}
            >
              <Trash2 size={14} className="text-slate-500 group-hover:text-red-600" />
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
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Database className="text-[#EAD19B]" size={28} />
          )}
          <div>
            <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">
              {selectedBranch ? `Kelola Dukuh: ${selectedBranch.name}` : 'Data Master'}
            </h1>
            <p className="text-[#F4F1EA]/60 text-sm font-medium">
              {selectedBranch 
                ? `Manajemen daftar dukuh/dusun di wilayah ${selectedBranch.name}`
                : 'Kelola informasi wilayah Ranting dan Dukuh.'}
            </p>
          </div>
        </div>
        
        <Button 
          onClick={() => {
            setEditingItem(null);
            setFormData({ name: '', code: '' });
            if (selectedBranch) setIsDukuhModalOpen(true);
            else setIsBranchModalOpen(true);
          }}
          className="bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 px-6 h-11 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus size={20} />
          {selectedBranch ? 'Tambah Dukuh' : 'Tambah Ranting'}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-500 transition-colors" size={18} />
          <input
            type="text"
            placeholder={selectedBranch ? "Cari dukuh..." : "Cari ranting (nama, kode)..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 focus:bg-white transition-all shadow-sm group-hover:border-slate-300"
          />
        </div>

      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        {selectedBranch ? (
          <Table 
            columns={dukuhColumns} 
            data={pagedData as any[]} 
            loading={loading}
          />
        ) : (
          <Table 
            columns={branchColumns} 
            data={pagedData as any[]} 
            loading={loading}
          />
        )}
        
        {!loading && totalItems > 0 && (
          <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
            <p className="text-xs font-medium text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{pagedData.length}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> {selectedBranch ? 'dukuh' : 'ranting'}
            </p>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
                <select 
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                  Halaman <span className="text-green-600">{currentPage}</span> dari {totalPages || 1}
                </span>
                
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200"
                  >
                    Selanjutnya
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {!loading && totalItems === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <MapPin size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">Tidak ada data ditemukan</p>
          </div>
        )}
      </div>

      {/* Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">{editingItem ? 'Edit Ranting' : 'Tambah Ranting Baru'}</h3>
              <p className="text-sm text-slate-500 mt-1">Lengkapi informasi ranting di bawah ini.</p>
            </div>
            
            <form onSubmit={handleBranchSubmit} className="p-8 space-y-5">
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
                  variant="outline" 
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 rounded-xl h-12 font-bold"
                >
                  Batal
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl h-12 font-bold shadow-lg shadow-[#EAD19B]/20"
                >
                  Simpan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dukuh Modal */}
      {isDukuhModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">{editingItem ? 'Edit Dukuh' : 'Tambah Dukuh Baru'}</h3>
              <p className="text-sm text-slate-500 mt-1">Ranting: <span className="font-bold text-green-600">{selectedBranch?.name}</span></p>
            </div>
            
            <form onSubmit={handleDukuhSubmit} className="p-8 space-y-5">
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
                  variant="outline" 
                  onClick={() => setIsDukuhModalOpen(false)}
                  className="flex-1 rounded-xl h-12 font-bold"
                >
                  Batal
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-600/20"
                >
                  Simpan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
