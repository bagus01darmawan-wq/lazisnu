import { Bell, Search, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  user?: {
    full_name?: string;
    role?: string;
  };
}

const Header = ({ title, user }: HeaderProps) => {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Cari..."
            className="pl-10 pr-4 py-2 w-64 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={20} className="text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-800">
              {user?.full_name || 'User'}
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {user?.role?.replace('_', ' ').toLowerCase()}
            </div>
          </div>
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <User size={20} className="text-primary-600" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;