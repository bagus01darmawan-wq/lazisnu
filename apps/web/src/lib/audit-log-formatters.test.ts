import {describe, expect, it} from 'vitest';
import {formatAuditAction, getAuditActionTone, getProp} from './audit-log-formatters';

describe('getProp', () => {
  it('mengambil properti dengan fallback camelCase/snake_case', () => {
    expect(getProp({fullName: 'Ali'}, ['fullName', 'full_name'])).toBe('Ali');
    expect(getProp({full_name: 'Budi'}, ['fullName', 'full_name'])).toBe('Budi');
  });

  it('mengembalikan undefined bila kunci tidak ada atau objek invalid', () => {
    expect(getProp({}, ['fullName'])).toBeUndefined();
    expect(getProp(null, ['fullName'])).toBeUndefined();
  });
});

describe('formatAuditAction', () => {
  it('memetakan aksi autentikasi ke label Indonesia', () => {
    expect(formatAuditAction('LOGIN_SUCCESS')).toBe('Login Berhasil');
    expect(formatAuditAction('FAILED_LOGIN')).toBe('Login Gagal');
    expect(formatAuditAction('LOGOUT')).toBe('Logout');
  });

  it('memetakan mutasi POST ke label yang sesuai', () => {
    expect(formatAuditAction('POST /cans')).toBe('Menambahkan Kaleng');
    expect(formatAuditAction('POST /officers')).toBe('Menambahkan Petugas');
  });

  it('menangani aksi resubmit dan WA dengan substring', () => {
    expect(formatAuditAction('COLLECTIONS/RESUBMIT')).toBe('Koreksi Setoran');
    expect(formatAuditAction('WA/RETRY 123')).toBe('Jadwalkan Ulang Notifikasi');
  });

  it('memetakan aksi siklus periode C1 ke label Indonesia (T10)', () => {
    expect(formatAuditAction('PPK_SIGNED')).toBe('PPK Menandatangani Setoran');
    expect(formatAuditAction('PPK_COUNTERSIGNED_FINAL')).toBe('Bendahara Mengunci Setoran PPK (FINAL)');
    expect(formatAuditAction('BRANCH_FINALIZED')).toBe('Rekap Ranting Dikunci (FINAL)');
    expect(formatAuditAction('DRAFT_APPROVED')).toBe('Draft Tugas Disetujui');
    expect(formatAuditAction('KUNCI_PERIODE_FINAL_NOL_MASSAL')).toBe('MWC Mengunci NOL Massal');
    expect(formatAuditAction('PPK_REOPENED')).toBe('Setoran PPK Dibuka Kembali (Reopen)');
    expect(formatAuditAction('EMERGENCY_AGGREGATE_RECORDED')).toBe('Mencatat Agregat Darurat');
    expect(formatAuditAction('MANUAL_COLLECTION')).toBe('Salin Manual Koleksi (Kertas)');
    expect(formatAuditAction('BA_DOWNLOADED')).toBe('Mengunduh Berita Acara');
  });

  it('memberi tone kunci/reopen = warning, FINAL/unduh = success', () => {
    expect(getAuditActionTone('PPK_REOPENED')).toBe('warning');
    expect(getAuditActionTone('KUNCI_PERIODE_REKAP')).toBe('warning');
    expect(getAuditActionTone('MANUAL_COLLECTION')).toBe('warning');
    expect(getAuditActionTone('PPK_FINALIZED')).toBe('success');
    expect(getAuditActionTone('DRAFT_APPROVED')).toBe('success');
    expect(getAuditActionTone('BA_DOWNLOADED')).toBe('success');
    expect(getAuditActionTone('PPK_SIGNED')).toBe('info');
  });
});
