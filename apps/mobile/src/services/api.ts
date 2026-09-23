// Mobile API Service - Lazisnu Collector App

import 'react-native-get-random-values';
import {MMKV} from 'react-native-mmkv';
import {Platform} from 'react-native';
import {
  ApiResponse,
  Task,
  AuthLoginResponse,
  MeResponse,
  DashboardResponse,
  TaskListResponse,
  ProfileResponse,
  HistoryResponse,
  BatchSyncResponse,
  BatchCollectionRequestItem,
  RangeStatsResponse,
  ProposalStatusResponse,
  CanVisitHistoryItem,
  VisitTask,
} from '@lazisnu/shared-types';
import {captureAuthEvent} from '../config/crashlytics';
import {saveRefreshTokenSilent} from './biometric';
import {resolveSessionAction} from './authSessionPolicy';

// Instance dibuat setelah encryption key tersedia. Membuka file terenkripsi
// tanpa key lebih dulu dapat membuat MMKV menganggap file corrupt dan meresetnya.
const AUTH_STORAGE_ID = '@lazisnu/auth-token';
let storage: MMKV | null = null;

export function initializeAuthStorage(encryptionKey: string, migrateUnencrypted = false): MMKV {
  const instance = new MMKV(
    migrateUnencrypted ? {id: AUTH_STORAGE_ID} : {id: AUTH_STORAGE_ID, encryptionKey},
  );

  if (migrateUnencrypted) {
    instance.recrypt(encryptionKey);
  }

  storage = instance;
  return instance;
}

export function getAuthStorage(): MMKV {
  if (!storage) {
    throw new Error('Auth storage belum diinisialisasi');
  }
  return storage;
}

const getApiOrigin = (): string => {
  // API_URL di-inline saat bundling via
  // babel-plugin-transform-inline-environment-variables (set di .env).
  // development: http://10.0.2.2:3001 (backend lokal, dari emulator AVD)
  // production:  https://api.lazisnu.site
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  // Fallback: bundle tanpa API_URL ter-inline (HP fisik & emulator).
  // 10.0.2.2 hanya valid di emulator AVD — di HP fisik menyebabkan
  // kegagalan koneksi yang keliru dilaporkan "tidak ada koneksi internet".
  // Debug mengikuti API produksi agar perilaku = release.
  return 'https://api.lazisnu.site';
};

export const API_ORIGIN = getApiOrigin();
export const API_BASE_URL = `${API_ORIGIN}/v1`;

// ── Token Management (MMKV is synchronous) ──────────────────────────────────

export const getToken = async (): Promise<string | null> => {
  return getAuthStorage().getString('access_token') || null;
};

export const setToken = async (token: string): Promise<void> => {
  getAuthStorage().set('access_token', token);
};

export const getRefreshToken = (): string | null => {
  return getAuthStorage().getString('refresh_token') || null;
};

export const setRefreshToken = (token: string): void => {
  getAuthStorage().set('refresh_token', token);
};

export const clearToken = async (): Promise<void> => {
  getAuthStorage().delete('access_token');
  getAuthStorage().delete('refresh_token');
};

// ── Device ID — identifikasi sesi per perangkat (Sub-bab 04 + 05) ─────────────

const DEVICE_ID_KEY = 'device_id';

/* eslint-disable no-bitwise */
function generateUUID(): string {
  // crypto.getRandomValues dipasang oleh polyfill react-native-get-random-values.
  // ID perangkat TIDAK boleh memakai Math.random() yang bisa diprediksi (standar Bab 2.2).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set versi 4 dan varian RFC 4122 agar formatnya UUID yang valid.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/* eslint-enable no-bitwise */

export function getOrCreateDeviceId(): string {
  const existing = getAuthStorage().getString(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const newId = generateUUID();
  getAuthStorage().set(DEVICE_ID_KEY, newId);
  return newId;
}

export function getDeviceLabel(): string {
  // Platform.OS = 'android' | 'ios', Platform.Version = versi OS
  return `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} ${Platform.Version}`;
}

// ── Token Refresh Logic ──────────────────────────────────────────────────────

let isRefreshing = false;

// Setiap subscriber mendaftarkan 2 callback: sukses dan gagal.
// Tanpa onFailure, antrean request yang menunggu akan hang selamanya
// saat refresh token gagal (lihat review auth-verdict #2).
type RefreshSubscriber = {
  onSuccess: (token: string) => void;
  onFailure: () => void;
};
let refreshSubscribers: RefreshSubscriber[] = [];

// Handler SESSION_EXPIRED — dipasang oleh useAuthStore agar api.ts
// tidak perlu import store (mencegah circular dependency).
// Setelah dipanggil, state klien di-reset dan UI kembali ke AuthStack.
// Argumen reason = kode penolakan bisnis (REFRESH_REVOKED / ACCOUNT_DISABLED /
// OFFICER_DISABLED) untuk pesan UX spesifik.
let sessionExpiredHandler: ((reason?: string) => void) | null = null;

export function setSessionExpiredHandler(handler: ((reason?: string) => void) | null) {
  sessionExpiredHandler = handler;
}

function notifySessionExpired(reason?: string) {
  // Telemetri post-rollout: lacak frekuensi SESSION_EXPIRED per user/device
  captureAuthEvent('session_expired', {source: 'refresh_failed', reason});
  if (sessionExpiredHandler) {
    try {
      sessionExpiredHandler(reason);
    } catch (e) {
      /* swallow */
    }
  }
}

function onRefreshed(newToken: string) {
  refreshSubscribers.forEach(sub => sub.onSuccess(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers.forEach(sub => sub.onFailure());
  refreshSubscribers = [];
}

export const DEFAULT_API_TIMEOUT_MS = 15_000;

function createTimeoutSignal(timeoutMs: number, customSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (customSignal) {
    customSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const {signal, cleanup} = createTimeoutSignal(timeoutMs, options.signal);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    return response;
  } finally {
    cleanup();
  }
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('aborted')
    );
  }
  return (
    String(error).toLowerCase().includes('timeout') ||
    String(error).toLowerCase().includes('aborted')
  );
}

type RefreshResult = {token: string | null; networkError: boolean; denialCode?: string};

/**
 * Mutex lintas-jalur: interceptor 401 dan login biometrik sama-sama memutar
 * refresh token single-use. Tanpa antrean ini dua jalur bisa balapan memakai
 * token yang sama hampir bersamaan.
 */
let refreshQueueTail: Promise<unknown> = Promise.resolve();
function enqueueRefresh<T>(fn: () => Promise<T>): Promise<T> {
  const run = refreshQueueTail.then(fn, fn);
  refreshQueueTail = run.catch(() => {});
  return run;
}

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return {token: null, networkError: false};
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: refreshToken}),
    });

    const data = await response.json();
    if (response.ok && data.data?.access_token) {
      const newToken = data.data.access_token;
      await setToken(newToken);
      // Jika refresh token baru diterima, simpan juga
      if (data.data.refresh_token) {
        setRefreshToken(data.data.refresh_token);
        // Perbarui GUDANG token silent (tanpa prompt!). Menulis ke service
        // ber-accessControl biometrik memunculkan prompt sidik jari di waktu
        // arbitrer (keychain v10 memakai BiometricPrompt di jalur encrypt) —
        // penyebab bug "modal biometrik muncul di halaman statistik".
        try {
          const {useAuthStore} = require('../stores/useAuthStore');
          if (useAuthStore.getState().biometricEnabled) {
            await saveRefreshTokenSilent(data.data.refresh_token);
          }
        } catch {
          /* biometrik opsional — kegagalan Keychain tidak boleh gagalkan refresh */
        }
      }
      return {token: newToken, networkError: false};
    }

    // Sesi Permanen Sliding: HANYA penolakan bisnis eksplisit yang boleh
    // membersihkan sesi lokal. INVALID_TOKEN / 5xx / bentuk tak dikenal =
    // treat sebagai masalah sementara — token dipertahankan agar petugas
    // tidak ter-logout saat sinyal buruk.
    const errorCode = data?.error?.code as string | undefined;
    if (resolveSessionAction(errorCode) === 'logout') {
      await clearToken();
      return {token: null, networkError: false, denialCode: errorCode};
    }
    return {token: null, networkError: true};
  } catch {
    // Network error / timeout / JSON parse error — JANGAN clearToken di sini.
    // Token masih bisa valid; user bisa retry saat online.
    return {token: null, networkError: true};
  }
}

// ── API Request with Auto-Refresh ────────────────────────────────────────────

const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<ApiResponse<T>> => {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // ── Handle 401: coba refresh token, lalu retry (kecuali endpoint auth/login/otp) ──
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/request-otp') ||
      endpoint.includes('/auth/verify-otp');
    if (response.status === 401 && !_isRetry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Tunggu refresh yang sedang berjalan — Daftarkan 2 jalur callback
        // agar subscriber tidak hang saat refresh gagal.
        return new Promise<ApiResponse<T>>(resolve => {
          refreshSubscribers.push({
            onSuccess: async newToken => {
              try {
                const retryResponse = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
                  ...options,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${newToken}`,
                    ...options.headers,
                  },
                });
                const retryData = await retryResponse.json();
                if (retryResponse.ok) {
                  resolve({success: true, data: retryData.data || retryData});
                } else {
                  resolve({
                    success: false,
                    error: {code: 'UNAUTHORIZED', message: 'Sesi telah berakhir'},
                  });
                }
              } catch (error: unknown) {
                const isTimeout = isTimeoutError(error);
                resolve({
                  success: false,
                  error: {
                    code: 'NETWORK_ERROR',
                    message: isTimeout
                      ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
                      : 'Tidak ada koneksi internet',
                  },
                });
              }
            },
            onFailure: () => {
              // Refresh gagal — broadcast SESSION_EXPIRED ke subscriber ini
              resolve({
                success: false,
                error: {
                  code: 'SESSION_EXPIRED',
                  message: 'Sesi telah berakhir. Silakan login kembali.',
                },
              });
            },
          });
        });
      }

      isRefreshing = true;
      // Mutex bersama dengan jalur biometrik — cegah dua rotasi paralel
      const refreshResult = await enqueueRefresh(() => refreshAccessToken());
      isRefreshing = false;

      if (refreshResult.token) {
        onRefreshed(refreshResult.token);
        // Retry original request dengan token baru
        return apiRequest<T>(endpoint, options, true);
      } else if (refreshResult.networkError) {
        // Masalah teknis (jaringan/server/token invalid sesaat) — sesi lokal
        // DIPERTAHANKAN; petugas tidak ter-logout, cukup gagal-soft.
        onRefreshFailed();
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Tidak ada koneksi internet atau koneksi timeout',
          },
        };
      } else {
        // Penolakan bisnis eksplisit (revoked/disabled) — flush subscriber lalu
        // broadcast SESSION_EXPIRED agar UI kembali ke AuthStack.
        onRefreshFailed();
        notifySessionExpired(refreshResult.denialCode);
        return {
          success: false,
          error: {code: 'SESSION_EXPIRED', message: 'Sesi telah berakhir. Silakan login kembali.'},
        };
      }
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: data.error?.code || 'UNKNOWN_ERROR',
          message: data.error?.message || 'Terjadi kesalahan',
          details: data.error?.details,
        },
      };
    }

    return {success: true, data: data.data || data};
  } catch (error: unknown) {
    const isTimeout = isTimeoutError(error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: isTimeout
          ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
          : 'Tidak ada koneksi internet. Periksa jaringan Anda.',
      },
    };
  }
};

// ── Auth Services ────────────────────────────────────────────────────────────

export const authService = {
  login: async (identifier: string, password: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        password,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  requestOTP: async (
    phone: string,
  ): Promise<ApiResponse<{message: string; expires_in: number}>> => {
    return apiRequest('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  verifyOTP: async (phone: string, otp: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        otp,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  refresh: async (
    refreshToken: string,
  ): Promise<ApiResponse<{access_token: string; refresh_token: string}>> => {
    // Sengaja TIDAK lewat apiRequest: 401 dari endpoint /auth/refresh tidak
    // boleh memicu interceptor auto-refresh (yang memakai token lokal yang
    // berbeda) — pemanggil (login biometrik) butuh kode error asli server
    // (REFRESH_REVOKED vs NETWORK_ERROR) untuk memutuskan disable biometrik.
    try {
      // Mutex bersama dengan interceptor — rotasi tidak boleh balapan
      const response = await enqueueRefresh(() =>
        fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            refresh_token: refreshToken,
            device_id: getOrCreateDeviceId(),
          }),
        }),
      );
      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          error: {
            code: data.error?.code || 'UNKNOWN_ERROR',
            message: data.error?.message || 'Terjadi kesalahan',
            details: data.error?.details,
          },
        };
      }
      return {success: true, data: data.data || data};
    } catch (error: unknown) {
      const isTimeout = isTimeoutError(error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: isTimeout
            ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
            : 'Tidak ada koneksi internet. Periksa jaringan Anda.',
        },
      };
    }
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({refresh_token: refreshToken}),
      }).catch(() => {});
    }
    await clearToken();
  },

  me: async (): Promise<ApiResponse<MeResponse>> => {
    return apiRequest<MeResponse>('/auth/me');
  },
};

// ── Dashboard Services ────────────────────────────────────────────────────────

export const dashboardService = {
  getDashboard: async (): Promise<ApiResponse<DashboardResponse>> => {
    return apiRequest<DashboardResponse>('/mobile/dashboard');
  },

  getProfile: async (): Promise<ApiResponse<ProfileResponse>> => {
    return apiRequest<ProfileResponse>('/mobile/profile');
  },
};

// ── Tasks Services ────────────────────────────────────────────────────────────

export const tasksService = {
  getTasks: async (params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<TaskListResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const query = queryParams.toString();
    return apiRequest<TaskListResponse>(`/mobile/tasks${query ? `?${query}` : ''}`);
  },

  getTaskByQR: async (qrCode: string): Promise<ApiResponse<Task>> => {
    return apiRequest<Task>(`/mobile/scan/${encodeURIComponent(qrCode)}`);
  },

  getRangeStats: async (start: string, end: string): Promise<ApiResponse<RangeStatsResponse>> => {
    const query = new URLSearchParams({start, end}).toString();
    return apiRequest<RangeStatsResponse>(`/mobile/tasks/stats-range?${query}`);
  },

  /**
   * Status usulan kondisi terbaru untuk satu assignment milik petugas.
   * Proyeksi status saja (bukan detail admin). `proposal` null bila belum
   * pernah ada usulan untuk kaleng pada tugas ini.
   */
  getProposalStatus: async (assignmentId: string): Promise<ApiResponse<ProposalStatusResponse>> => {
    return apiRequest<ProposalStatusResponse>(
      `/mobile/assignments/${encodeURIComponent(assignmentId)}/proposal-status`,
    );
  },
};

// ── Collection Services ───────────────────────────────────────────────────────

export const collectionService = {
  submitCollection: async (data: {
    assignment_id: string;
    can_id: string;
    nominal: number;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: {
      model: string;
      os_version: string;
      app_version: string;
    };
    offline_id?: string;
  }): Promise<
    ApiResponse<{
      id: string;
      sync_status: 'COMPLETED' | 'ALREADY_SYNCED';
      whatsapp_status: 'ENQUEUED' | 'FAILED' | 'SKIPPED';
      message: string;
    }>
  > => {
    return apiRequest('/mobile/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmit: async (
    collections: BatchCollectionRequestItem[],
  ): Promise<ApiResponse<BatchSyncResponse>> => {
    return apiRequest<BatchSyncResponse>('/mobile/collections/batch', {
      method: 'POST',
      body: JSON.stringify({collections}),
    });
  },

  getSyncStatus: async (): Promise<
    ApiResponse<{pending_count: number; last_sync_at: string; oldest_pending: string | null}>
  > => {
    return apiRequest('/mobile/sync/status');
  },

  getHistory: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<HistoryResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    const query = queryParams.toString();
    return apiRequest<HistoryResponse>(`/mobile/history${query ? `?${query}` : ''}`);
  },

  resubmitCollection: async (
    id: string,
    data: {nominal: number; alasan_resubmit: string},
  ): Promise<
    ApiResponse<{id: string; submit_sequence: number; whatsapp_status: string; message: string}>
  > => {
    return apiRequest(`/mobile/collections/${id}/resubmit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Tandai tugas tidak terjemput.
   *
   * `reasonCode` wajib pada APK baru (pemilih alasan berlabel). Backend masih
   * memetakan kiriman tanpa kode ke `OTHER` selama masa transisi, jadi APK lama
   * tetap berfungsi. Urutan argumen lama tetap didukung: `skipAssignment(id, notes)`.
   */
  skipAssignment: async (
    id: string,
    notesOrReason?: string,
    legacyNotes?: string,
  ): Promise<
    ApiResponse<{
      id: string;
      status: string;
      message: string;
      reason_code?: string;
      /** Diisi server bila alasan memicu usulan kondisi (CAN_LOST/CAN_DAMAGED). */
      proposal_id?: string;
    }>
  > => {
    const isReasonCode = !!notesOrReason && /^[A-Z_]{4,}$/.test(notesOrReason);
    const reasonCode = isReasonCode ? notesOrReason : undefined;
    const notes = isReasonCode ? legacyNotes : notesOrReason;

    const body: Record<string, string> = {};
    if (reasonCode) body.reason_code = reasonCode;
    if (notes) body.notes = notes;

    return apiRequest(`/mobile/assignments/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * Catat kunjungan non-penjemputan (verifikasi kaleng non-aktif / penggantian unit).
   * Bukan collection: tidak ada nominal dan tidak menambah hitungan kosong.
   */
  recordCanVisit: async (
    canId: string,
    purpose: 'VERIFIKASI' | 'PENGGANTIAN' | 'PENCABUTAN',
    notes?: string,
  ): Promise<
    ApiResponse<{id: string; can_id: string; purpose: string; condition: string; message: string}>
  > => {
    return apiRequest(`/mobile/cans/${canId}/visits`, {
      method: 'POST',
      body: JSON.stringify(notes ? {purpose, notes} : {purpose}),
    });
  },

  /**
   * B2: daftar kaleng NON_AKTIF di wilayah petugas yang perlu dikunjungi.
   */
  getVisitRequired: async (): Promise<ApiResponse<{items: VisitTask[]; total: number}>> => {
    return apiRequest('/mobile/cans/visit-required', {method: 'GET'});
  },

  /**
   * B2: pastikan ada assignment periode berjalan untuk kaleng NON_AKTIF yang
   * akan diisi petugas. Penjemputan butuh assignment asli
   * (collections.assignment_id NOT NULL); idempoten.
   */
  ensureAssignment: async (
    canId: string,
  ): Promise<ApiResponse<{assignment_id: string; status: string}>> => {
    // Body eksplisit: Fastify menolak POST dengan Content-Type application/json
    // tanpa body (FST_ERR_CTP_EMPTY_JSON_BODY → 400).
    return apiRequest(`/mobile/cans/${canId}/ensure-assignment`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  completePeriod: async (): Promise<
    ApiResponse<{
      period: string;
      skipped_count: number;
      expired_closed_count: number;
      message: string;
    }>
  > => {
    return apiRequest('/mobile/periods/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /**
   * Riwayat kunjungan non-penjemputan milik petugas (terbaru dulu).
   * Proyeksi ringan untuk layar Riwayat — bukan angka penjemputan.
   */
  getVisits: async (limit = 10): Promise<ApiResponse<{items: CanVisitHistoryItem[]}>> => {
    return apiRequest<{items: CanVisitHistoryItem[]}>(`/mobile/visits?limit=${limit}`);
  },
};

// ── Network Check ─────────────────────────────────────────────────────────────

export const networkService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_ORIGIN}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  },
};

// ── C1-T9: kontrak peran (1 APK, tampil beda per kartu) ──────────────────────
// DTO lokal per endpoint (snake_case, cermin respons backend). Penjaga peran
// tetap di server; klien hanya memilih endpoint sesuai peran login.

export interface PeriodInfoDto {
  period: string;
  period_year: number;
  period_month: number;
  assign_date: string;
  due_date: string;
  tolerance_end: string;
  period_status: 'OPEN' | 'TOLERANCE' | 'LOCKED' | 'DIBUKA_SEBAGIAN';
  days_to_due: number;
  days_to_lock: number;
  in_tolerance: boolean;
}

export interface PpkSubmissionDto {
  id: string;
  officer_id: string;
  branch_id: string;
  period: string;
  period_year: number;
  period_month: number;
  total_amount: number;
  collection_count: number;
  bisyaroh_amount: number;
  net_amount: number;
  status: 'DRAFT' | 'PPK_SIGNED' | 'FINAL';
  version: number;
  ppk_signer_id: string | null;
  bendahara_signer_id: string | null;
}

export interface BaTextDto {
  kind: 'ppk' | 'branch';
  title: string;
  /** Kode formulir org (mis. F-NUCARE/PYL-10 Rev. 0). */
  form_code?: string;
  /** Nomor BA (001/BA/IX/2026) — null sebelum FINAL pertama. */
  ba_number?: string | null;
  period: string;
  table: Array<{label: string; value: string}>;
  statements: string[];
  draft_warning: string | null;
}

export interface BaPdfDto {
  download_url: string;
  expires_in_seconds: number;
  pdf_hash: string;
  reused: boolean;
}

export interface BaVersionDto {
  version: number;
  status: string;
  pdf_hash: string | null;
  content_hash: string;
  verify_url: string;
  archived_at: string | null;
  is_current: boolean;
}

/**
 * Satu baris setoran ranting — bentuk `toBranchResponse` di backend.
 *
 * Dipakai halaman Profil untuk daftar Berita Acara. `pdf_url` **non-null
 * berarti berkas sudah pernah diterbitkan**, dan itulah satu-satunya penanda
 * yang dipakai UI untuk memutuskan tombol Unduh muncul atau belum (server tidak
 * mengirim `pdf_hash` di daftar ini).
 */
export interface BranchSubmissionRowDto {
  id: string;
  branch_id: string;
  /** Ditambahkan di route daftar — `toBranchResponse` sendiri hanya punya id. */
  branch_name: string | null;
  period: string;
  total_amount: number;
  bisyaroh_total: number;
  share_mwc: number;
  net_amount: number;
  /** DRAFT belum sah — Generate/Unduh ditolak server sampai FINAL/FINAL_NOL. */
  status: string;
  version: number;
  pdf_url: string | null;
  ba_number: string | null;
}

export interface PeriodDraftDto {
  id: string;
  period: string;
  period_year: number;
  period_month: number;
  branch_id: string;
  branch_name: string;
  branch_kind: 'RANTING' | 'PROGRAM_MWC';
  status: 'DRAFT' | 'APPROVED';
  prepared_at: string;
  item_count: number;
  /** PENDING = menunggu Staf; ESCALATED = lewat 24 jam, giliran Keuangan. */
  event_kind: 'APPROVED' | 'ESCALATED' | 'PENDING';
  period_status: string;
}

export interface StafSummaryDto {
  period: string;
  period_status: string;
  // K1 (review-T9): countdown nyata dari server (ganti konstanta klien).
  days_to_due: number;
  days_to_lock: number;
  in_tolerance: boolean;
  scope: {kind: 'RANTING' | 'PROGRAM_MWC'; branch_id: string | null; district_id: string | null};
  drafts: {pending: number; escalated: number; approved: number};
  ppk: {final_count: number; total_count: number};
  tugas_active: number;
}

export interface KeuanganInboxItemDto {
  /**
   * - `ppk` — setoran PPK menunggu counter-sign Bendahara Ranting.
   * - `branch_sign` — BA ranting menunggu **tanda tangan Bendahara Ranting**
   *   (tahap 1, serah terima ke MWC). Koreksi Pion 23 Sep 2026.
   * - `branch` — BA ranting menunggu counter-sign Bendahara MWC.
   */
  kind: 'ppk' | 'branch_sign' | 'branch';
  submission_id: string;
  branch_id: string;
  branch_name: string;
  officer_name: string | null;
  total: number;
  status: string;
  version: number;
  needs_force: boolean;
  /** Hanya berarti untuk `branch_sign`: setoran PPK yang belum FINAL. */
  ppk_belum_final: number;
  /** Hanya berarti untuk `branch_sign`: jumlah setoran PPK periode ini. */
  ppk_total: number;
  /** Hanya berarti untuk `branch_sign`: total bisyaroh PPK. */
  bisyaroh_total: number;
  /** Hanya berarti untuk `branch_sign`: 30% × (total − bisyaroh), dari server. */
  expected_share: number;
}

export interface MwcRecapDto {
  period: string;
  kartu_ranting: {
    total: number;
    bisyaroh: number;
    ekspektasi_share: number;
    share_mwc: number;
    bersih: number;
    reported_count: number;
    final_nol_count: number;
    belum_lapor_count: number;
  };
  kartu_program: {
    total: number;
    bisyaroh: number;
    bersih: number;
    reported_count: number;
    belum_lapor_count: number;
  };
  rows: Array<{
    branch_id: string;
    branch_name: string;
    kind: 'RANTING' | 'PROGRAM_MWC';
    status: 'FINAL' | 'FINAL_NOL' | 'BELUM_LAPOR';
    total: number;
    bisyaroh: number;
    share_mwc: number;
    bersih: number;
    selisih_share: number;
    variance_reason: string | null;
    flags: string[];
  }>;
}

const periodQuery = (year?: number, month?: number): string => {
  const q = new URLSearchParams();
  if (year !== undefined) q.append('year', String(year));
  if (month !== undefined) q.append('month', String(month));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const c1Service = {
  getPeriodInfo: async (year?: number, month?: number): Promise<ApiResponse<PeriodInfoDto>> => {
    return apiRequest<PeriodInfoDto>(`/mobile/period-info${periodQuery(year, month)}`);
  },

  saveDeviceToken: async (fcmToken: string): Promise<ApiResponse<{saved: boolean}>> => {
    return apiRequest('/mobile/device-token', {
      method: 'POST',
      body: JSON.stringify({fcm_token: fcmToken}),
    });
  },

  // PPK — setoran & TTD (tanda tangan interaktif = T10; status/BA/unduh = T9).
  getMySubmission: async (
    year?: number,
    month?: number,
  ): Promise<ApiResponse<PpkSubmissionDto>> => {
    return apiRequest<PpkSubmissionDto>(`/mobile/submissions${periodQuery(year, month)}`);
  },
  signSubmission: async (
    id: string,
    data: {signature_png: string; consent: boolean; expected_version?: number},
  ): Promise<ApiResponse<PpkSubmissionDto>> => {
    return apiRequest<PpkSubmissionDto>(`/mobile/submissions/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  countersignSubmission: async (
    id: string,
    data: {signature_png: string; consent: boolean; expected_version?: number},
  ): Promise<ApiResponse<PpkSubmissionDto>> => {
    return apiRequest<PpkSubmissionDto>(`/mobile/submissions/${id}/countersign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getBeritaAcara: async (id: string): Promise<ApiResponse<BaTextDto>> => {
    return apiRequest<BaTextDto>(`/mobile/submissions/${id}/berita-acara`);
  },
  getPdf: async (id: string): Promise<ApiResponse<BaPdfDto>> => {
    return apiRequest<BaPdfDto>(`/mobile/submissions/${id}/pdf`);
  },
  getPdfVersions: async (id: string): Promise<ApiResponse<BaVersionDto[]>> => {
    return apiRequest<BaVersionDto[]>(`/mobile/submissions/${id}/pdf-versions`);
  },

  // Staf Pengumpulan — setuju/monitor (approve = tombol Staf, eskalasi 24 jam).
  getDrafts: async (year?: number, month?: number): Promise<ApiResponse<PeriodDraftDto[]>> => {
    return apiRequest<PeriodDraftDto[]>(`/admin/period-drafts${periodQuery(year, month)}`);
  },
  approveDraft: async (id: string): Promise<ApiResponse<unknown>> => {
    return apiRequest(`/admin/period-drafts/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  getStafSummary: async (year?: number, month?: number): Promise<ApiResponse<StafSummaryDto>> => {
    return apiRequest<StafSummaryDto>(`/mobile/staf/ringkasan${periodQuery(year, month)}`);
  },

  // Keuangan — antrean TTD kedua + unduh BA.
  getKeuanganInbox: async (
    year?: number,
    month?: number,
  ): Promise<ApiResponse<{period: string; items: KeuanganInboxItemDto[]}>> => {
    return apiRequest(`/mobile/keuangan/inbox${periodQuery(year, month)}`);
  },
  countersignBranch: async (
    id: string,
    data: {signature_png: string; consent: boolean; expected_version?: number},
  ): Promise<ApiResponse<unknown>> => {
    return apiRequest(`/mobile/branch-submissions/${id}/countersign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /**
   * Tahap 1 BA ranting — **Bendahara Ranting** menandatangani (koreksi Pion
   * 23 Sep 2026). Status tetap DRAFT sampai Bendahara MWC meng-counter-sign.
   * Server menolak bila masih ada setoran PPK periode itu yang belum FINAL.
   */
  signBranch: async (
    id: string,
    data: {
      signature_png: string;
      consent: boolean;
      expected_version?: number;
      share_mwc: number;
      variance_reason?: string;
      linked_periods?: string[];
      as_nol?: boolean;
    },
  ): Promise<ApiResponse<unknown>> => {
    return apiRequest(`/admin/branch-submissions/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /** Teks BA ranting (baca-saja) — dipakai untuk menampilkan isi sebelum TTD. */
  getBranchBeritaAcara: async (id: string): Promise<ApiResponse<BaTextDto>> => {
    return apiRequest<BaTextDto>(`/admin/branch-submissions/${id}/berita-acara`);
  },
  getBranchPdfVersions: async (id: string): Promise<ApiResponse<BaVersionDto[]>> => {
    return apiRequest<BaVersionDto[]>(`/admin/branch-submissions/${id}/pdf-versions`);
  },
  /**
   * Daftar setoran ranting dalam cakupan akun (halaman Profil → Berita Acara).
   * Gerbang server `rantingOnly` = ADMIN_RANTING (rantingnya) / ADMIN_KECAMATAN
   * (sedistrik). Side effect yang disengaja server: daftar ini juga menyegarkan
   * angka cache baris ranting.
   */
  getBranchSubmissions: async (
    year?: number,
    month?: number,
  ): Promise<ApiResponse<BranchSubmissionRowDto[]>> => {
    return apiRequest<BranchSubmissionRowDto[]>(
      `/admin/branch-submissions${periodQuery(year, month)}`,
    );
  },
  /**
   * Terbitkan PDF BA ranting (idempoten). Server menolak bila status belum
   * FINAL/FINAL_NOL — "BA belum sah — belum kedua TTD".
   */
  generateBranchBaPdf: async (
    id: string,
  ): Promise<ApiResponse<{pdf_hash: string; version: number; reused: boolean}>> => {
    return apiRequest(`/admin/branch-submissions/${id}/pdf/generate`, {method: 'POST'});
  },
  /** Tautan unduh berumur pendek (600 detik) — ambil tepat saat mau dibuka. */
  getBranchBaPdf: async (id: string): Promise<ApiResponse<BaPdfDto>> => {
    return apiRequest<BaPdfDto>(`/admin/branch-submissions/${id}/pdf`);
  },

  // Manager — baca rekap MWC (FINAL saja, 2 kartu).
  getLaporanMwc: async (year?: number, month?: number): Promise<ApiResponse<MwcRecapDto>> => {
    return apiRequest<MwcRecapDto>(`/admin/laporan-mwc${periodQuery(year, month)}`);
  },
};

export default {
  auth: authService,
  dashboard: dashboardService,
  tasks: tasksService,
  collection: collectionService,
  network: networkService,
  c1: c1Service,
};
