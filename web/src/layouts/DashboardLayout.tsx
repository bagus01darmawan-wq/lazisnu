import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

const DashboardLayout = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin/branch')) {
      if (path === '/admin/branch' || path === '/admin/branch/') return 'Dashboard Admin Ranting';
      if (path.includes('/cans')) return 'Kelola Kaleng';
      if (path.includes('/officers')) return 'Kelola Petugas';
      if (path.includes('/assignments')) return 'Kelola Penugasan';
      if (path.includes('/reports')) return 'Laporan';
    }
    if (path.includes('/admin/district')) {
      if (path === '/admin/district' || path === '/admin/district/') return 'Dashboard Admin Kecamatan';
      if (path.includes('/branches')) return 'Semua Ranting';
      if (path.includes('/reports')) return 'Laporan Agregat';
    }
    if (path.includes('/bendahara')) {
      if (path === '/bendahara' || path === '/bendahara/') return 'Dashboard Bendahara';
      if (path.includes('/transactions')) return 'Detail Transaksi';
      if (path.includes('/export')) return 'Export Laporan';
    }
    return 'Dashboard';
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={getPageTitle()} user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;