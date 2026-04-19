import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface AuditLog {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  oldData: any;
  newData: any;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  user?: {
    id: string;
    fullName: string;
    role: string;
  };
  officer?: {
    id: string;
    fullName: string;
  };
}

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      // Replace with your actual API endpoint
      const response = await fetch('/v1/admin/audit-logs');
      const result = await response.json();
      if (result.success) {
        setLogs(result.data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (log: AuditLog) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Riwayat Aktivitas Sistem</h1>
        <button 
          onClick={fetchLogs}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-bottom border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Waktu</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pelaku</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entitas</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">Memuat data...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">Belum ada catatan aktivitas.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {format(new Date(log.createdAt), 'PPP HH:mm', { locale: id })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      log.actionType.startsWith('POST') ? 'bg-blue-100 text-blue-700' :
                      log.actionType.startsWith('PUT') || log.actionType.startsWith('PATCH') ? 'bg-yellow-100 text-yellow-700' :
                      log.actionType.startsWith('DELETE') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div className="font-semibold">{log.user?.fullName || log.officer?.fullName || 'System'}</div>
                    <div className="text-xs text-gray-400">{log.user?.role || 'User'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="font-mono">{log.entityType}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openDetail(log)}
                      className="text-green-600 hover:text-green-700 text-sm font-semibold"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {isModalOpen && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Detail Aktivitas</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow bg-white">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">Waktu</label>
                  <p className="text-sm">{format(new Date(selectedLog.createdAt), 'PPPP HH:mm:ss', { locale: id })}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">IP Address</label>
                  <p className="text-sm font-mono">{selectedLog.ipAddress}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Old Data */}
                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-2">DATA LAMA (SNAPSHOT)</h3>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 overflow-x-auto">
                    <pre className="text-xs text-red-600">
                      {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : '// Tidak ada data lama'}
                    </pre>
                  </div>
                </div>

                {/* New Data */}
                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-2">DATA BARU (HASIL)</h3>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-100 overflow-x-auto">
                    <pre className="text-xs text-green-700">
                      {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : '// Tidak ada data baru'}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="text-xs text-gray-400 uppercase font-bold">User Agent</label>
                <p className="text-[10px] text-gray-500 font-mono bg-gray-50 p-2 rounded mt-1">{selectedLog.userAgent}</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end bg-gray-50">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
