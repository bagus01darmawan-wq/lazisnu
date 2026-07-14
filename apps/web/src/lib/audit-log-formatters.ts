import { format } from 'date-fns';

export interface AuditLog {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user?: { fullName: string; role: string };
  officer?: { fullName: string };
  oldData: unknown;
  newData: unknown;
}

/**
 * Helper to extract nested properties with camelCase/snake_case fallbacks
 */
export const getProp = (obj: unknown, keys: string[]): unknown => {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

/**
 * Format raw action type into human readable Indonesian string
 */
export function formatAuditAction(actionType: string): string {
  const type = (actionType || '').toUpperCase();
  
  if (type === 'LOGIN_SUCCESS') return 'Login Berhasil';
  if (type === 'FAILED_LOGIN') return 'Login Gagal';
  if (type === 'FAILED_OTP') return 'Login OTP Gagal';
  if (type === 'AUTH_FAILED') return 'Autentikasi Gagal';
  if (type === 'LOGOUT') return 'Logout';
  if (type === 'EXPORT_CSV') return 'Mengunduh Laporan CSV';
  if (type === 'OWNERSHIP_DENIED' || type === 'FORBIDDEN') return 'Akses Ditolak';
  
  // Resubmit
  if (type.includes('RESUBMIT')) return 'Koreksi Setoran';
  
  // WhatsApp bulk queue actions
  if (type.includes('WA/RETRY')) return 'Jadwalkan Ulang Notifikasi';
  if (type.includes('WA/FLUSH-FAILED')) return 'Membersihkan Antrean Gagal';
  
  // Normal mutations
  const parts = type.split(' ');
  const method = parts[0];
  const path = parts[1] || '';

  if (method === 'POST') {
    if (path.includes('/cans/bulk')) return 'Impor Kaleng Massal';
    if (path.includes('/cans')) return 'Menambahkan Kaleng';
    if (path.includes('/officers')) return 'Menambahkan Petugas';
    if (path.includes('/assignments')) return 'Membuat Penugasan';
    if (path.includes('/generate')) return 'Penjadwalan Otomatis';
    return 'Menambah Data';
  }
  
  if (method === 'PUT' || method === 'PATCH') {
    if (path.includes('/cans')) return 'Mengubah Data Kaleng';
    if (path.includes('/officers')) return 'Mengubah Data Petugas';
    return 'Mengubah Data';
  }
  
  if (method === 'DELETE') {
    if (path.includes('/cans')) return 'Menghapus Kaleng';
    if (path.includes('/officers')) return 'Menghapus Petugas';
    return 'Menghapus Data';
  }

  // Fallback
  return actionType || 'Aktivitas Sistem';
}

/**
 * Format entity type to clean Indonesian name
 */
export function formatAuditEntity(entityType?: string | null): string {
  if (!entityType) return 'Sistem';
  const entity = entityType.toLowerCase();
  
  if (entity === 'cans') return 'Kaleng';
  if (entity === 'officers') return 'Petugas';
  if (entity === 'assignments') return 'Penugasan';
  if (entity === 'collections') return 'Setoran';
  if (entity === 'reports') return 'Laporan';
  if (entity === 'auth') return 'Autentikasi';
  if (entity === 'wa') return 'WhatsApp';
  if (entity === 'system') return 'Sistem';
  
  return entityType;
}

/**
 * Get visual tone based on action type
 */
export function getAuditActionTone(actionType: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  const type = (actionType || '').toUpperCase();
  
  if (type === 'LOGIN_SUCCESS' || type === 'EXPORT_CSV') return 'success';
  if (
    type === 'FAILED_LOGIN' || 
    type === 'FAILED_OTP' || 
    type === 'AUTH_FAILED' || 
    type === 'OWNERSHIP_DENIED' || 
    type === 'FORBIDDEN'
  ) return 'danger';
  if (type.includes('DELETE')) return 'danger';
  if (type.includes('PUT') || type.includes('PATCH') || type.includes('RESUBMIT')) return 'warning';
  
  return 'info';
}

/**
 * Generate a short, human-readable description of what changed
 */
export function summarizeAuditLog(log: AuditLog): string {
  const action = (log.actionType || '').toUpperCase();
  const operator = log.user?.fullName || log.officer?.fullName || 'Sistem';
  
  if (action === 'LOGIN_SUCCESS') {
    const method = getProp(log.newData, ['method']) as string | undefined;
    const displayMethod = method === 'otp' ? 'OTP' : 'kata sandi';
    return `${operator} berhasil masuk ke sistem menggunakan ${displayMethod}.`;
  }
  
  if (action === 'FAILED_LOGIN') {
    const reason = getProp(log.newData, ['reason']) as string | undefined;
    const identifier = getProp(log.newData, ['identifier']) as string | undefined;
    let detail = 'kredensial tidak valid';
    if (reason === 'USER_NOT_FOUND') detail = 'email/nomor HP tidak terdaftar';
    if (reason === 'INVALID_PASSWORD') detail = 'kata sandi salah';
    if (reason === 'ACCOUNT_DISABLED') detail = 'akun dinonaktifkan';
    return `Percobaan login oleh "${identifier || 'pengguna'}" gagal karena ${detail}.`;
  }

  if (action === 'FAILED_OTP') {
    const phone = getProp(log.newData, ['phone']) as string | undefined;
    return `Percobaan login OTP untuk nomor "${phone || '-'}" gagal karena OTP tidak valid.`;
  }

  if (action === 'AUTH_FAILED') {
    return 'Akses ditolak karena sesi tidak valid atau token tidak tersedia.';
  }

  if (action === 'OWNERSHIP_DENIED' || action === 'FORBIDDEN') {
    return `${operator} mencoba mengakses data di luar kewenangannya (akses ditolak).`;
  }
  
  if (action === 'LOGOUT') {
    return `${operator} keluar dari sistem.`;
  }
  
  if (action === 'EXPORT_CSV') {
    const startDate = getProp(log.newData, ['start_date', 'startDate']) as string | undefined;
    const endDate = getProp(log.newData, ['end_date', 'endDate']) as string | undefined;
    const start = startDate ? format(new Date(startDate), 'dd/MM/yyyy') : null;
    const end = endDate ? format(new Date(endDate), 'dd/MM/yyyy') : null;
    if (start && end) {
      return `${operator} mengunduh laporan CSV periode ${start} s/d ${end}.`;
    }
    return `${operator} mengunduh laporan CSV transaksi.`;
  }

  if (action.includes('WA/RETRY')) {
    const jobId = (getProp(log.newData, ['jobId', 'job_id']) || getProp(log.oldData, ['jobId', 'job_id'])) as string | undefined;
    return `${operator} menjadwalkan ulang pengiriman WhatsApp untuk Job ID "${jobId || '-'}".`;
  }

  if (action.includes('WA/FLUSH-FAILED')) {
    return `${operator} membersihkan antrean pengiriman WhatsApp yang gagal.`;
  }

  // Handle CRUD based on entity type and oldData / newData
  const isCreate = !log.oldData && !!log.newData;
  const isDelete = !!log.oldData && !log.newData;
  const isUpdate = !!log.oldData && !!log.newData;
  
  const entity = formatAuditEntity(log.entityType);

  if (isCreate) {
    const name = getProp(log.newData, ['ownerName', 'owner_name', 'fullName', 'full_name']) as string | undefined;
    if (name) {
      return `${operator} menambahkan data ${entity.toLowerCase()} baru: "${name}".`;
    }
    return `${operator} menambahkan data ${entity.toLowerCase()} baru.`;
  }

  if (isDelete) {
    const name = getProp(log.oldData, ['ownerName', 'owner_name', 'fullName', 'full_name']) as string | undefined;
    if (name) {
      return `${operator} menghapus data ${entity.toLowerCase()}: "${name}".`;
    }
    return `${operator} menghapus data ${entity.toLowerCase()}.`;
  }

  if (isUpdate) {
    // Check for resubmit / collection correction first
    if (log.entityType === 'collections' || action.includes('RESUBMIT')) {
      const oldNominal = getProp(log.oldData, ['nominal']);
      const newNominal = getProp(log.newData, ['nominal']);
      const alasan = getProp(log.newData, ['alasanResubmit', 'alasan_resubmit']) as string | undefined;
      const formattedOld = oldNominal !== undefined ? `Rp ${Number(oldNominal).toLocaleString('id-ID')}` : 'Rp 0';
      const formattedNew = newNominal !== undefined ? `Rp ${Number(newNominal).toLocaleString('id-ID')}` : 'Rp 0';
      return `${operator} mengoreksi nominal setoran dari ${formattedOld} menjadi ${formattedNew} dengan alasan: "${alasan || '-'}".`;
    }

    // Normal updates: compare key changes
    const changes: string[] = [];
    const fieldsToCompare = [
      { keys: ['ownerName', 'owner_name'], label: 'nama pemilik' },
      { keys: ['ownerWhatsapp', 'owner_whatsapp', 'phone'], label: 'nomor WhatsApp/HP' },
      { keys: ['ownerAddress', 'owner_address'], label: 'alamat' },
      { keys: ['isActive', 'is_active'], label: 'status aktif' },
      { keys: ['fullName', 'full_name'], label: 'nama lengkap' },
      { keys: ['nominal'], label: 'nominal' },
      { keys: ['status'], label: 'status' },
    ];

    for (const field of fieldsToCompare) {
      const oldVal = getProp(log.oldData, field.keys);
      const newVal = getProp(log.newData, field.keys);
      
      if (oldVal !== undefined && newVal !== undefined && String(oldVal) !== String(newVal)) {
        let oldDisplay = String(oldVal);
        let newDisplay = String(newVal);
        
        // Format boolean
        if (oldVal === true || oldVal === 'true') oldDisplay = 'Aktif';
        if (oldVal === false || oldVal === 'false') oldDisplay = 'Nonaktif';
        if (newVal === true || newVal === 'true') newDisplay = 'Aktif';
        if (newVal === false || newVal === 'false') newDisplay = 'Nonaktif';

        // Format currency
        if (field.label === 'nominal') {
          oldDisplay = `Rp ${Number(oldVal).toLocaleString('id-ID')}`;
          newDisplay = `Rp ${Number(newVal).toLocaleString('id-ID')}`;
        }

        changes.push(`${field.label} dari "${oldDisplay}" menjadi "${newDisplay}"`);
      }
    }

    if (changes.length > 0) {
      const name = getProp(log.newData, ['ownerName', 'owner_name', 'fullName', 'full_name']) || getProp(log.oldData, ['ownerName', 'owner_name', 'fullName', 'full_name']);
      const targetStr = name ? ` "${name}"` : '';
      return `${operator} mengubah data ${entity.toLowerCase()}${targetStr}: mengubah ${changes.join(', ')}.`;
    }

    return `${operator} memperbarui data ${entity.toLowerCase()}.`;
  }

  return 'Detail perubahan tidak tersedia untuk aktivitas ini.';
}
