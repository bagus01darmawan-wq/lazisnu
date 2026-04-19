import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Home, Box, Users, ClipboardList, FileText, Building2, Receipt, LogOut } from 'lucide-react';
import clsx from 'clsx';

const Sidebar = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const getMenuItems = () => {
    const role = user?.role;

    if (role === 'ADMIN_RANTING') {
      return [
        { path: '/admin/branch', icon: Home, label: 'Dashboard' },
        { path: '/admin/branch/cans', icon: Box, label: 'Kaleng' },
        { path: '/admin/branch/officers', icon: Users, label: 'Petugas' },
        { path: '/admin/branch/assignments', icon: ClipboardList, label: 'Penugasan' },
        { path: '/admin/branch/reports', icon: FileText, label: 'Laporan' },
      ];
    }

    if (role === 'ADMIN_KECAMATAN') {
      return [
        { path: '/admin/district', icon: Home, label: 'Dashboard' },
        { path: '/admin/district/branches', icon: Building2, label: 'Semua Ranting' },
        { path: '/admin/district/audit-logs', icon: ClipboardList, label: 'Log Aktivitas' },
        { path: '/admin/district/reports', icon: FileText, label: 'Laporan' },
      ];
    }

    if (role === 'BENDAHARA') {
      return [
        { path: '/bendahara', icon: Home, label: 'Dashboard' },
        { path: '/bendahara/transactions', icon: Receipt, label: 'Transaksi' },
        { path: '/bendahara/export', icon: FileText, label: 'Export CSV' },
      ];
    }

    return [];
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-64 bg-primary-800 text-white flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-primary-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-xl font-bold">L</span>
          </div>
          <div>
            <div className="font-semibold">LAZISNU</div>
            <div className="text-xs text-primary-300">Collector App</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'flex items-center gap-3 px-6 py-3 transition-colors',
                isActive
                  ? 'bg-primary-700 border-r-4 border-primary-400'
                  : 'hover:bg-primary-700/50'
              )}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="p-4 border-t border-primary-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium">
              {user?.full_name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.full_name || 'User'}</div>
            <div className="text-xs text-primary-300 capitalize">
              {user?.role?.replace('_', ' ').toLowerCase() || 'Unknown'}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 rounded-lg transition-colors text-sm"
        >
          <LogOut size={18} />
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;