// Mobile API Service - Lazisnu Collector App

import { MMKV } from 'react-native-mmkv';
import { ApiResponse, Collection, Task } from '../types';

export const storage = new MMKV();

// For USB debugging, localhost magically connects to computer via adb reverse.
const API_BASE_URL = 'http://localhost:3000/v1';

// Token management (MMKV is synchronous)
export const getToken = async (): Promise<string | null> => {
  return storage.getString('access_token') || null;
};

export const setToken = async (token: string): Promise<void> => {
  storage.set('access_token', token);
};

export const clearToken = async (): Promise<void> => {
  storage.delete('access_token');
  storage.delete('refresh_token');
};

// API helper
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  try {
    const token = await getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

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

    return { success: true, data: data.data || data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Tidak ada koneksi internet',
      },
    };
  }
};

// Auth Services
export const authService = {
  login: async (phone: string, password: string) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
  },

  requestOTP: async (phone: string) => {
    return apiRequest('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOTP: async (phone: string, otp: string) => {
    return apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    });
  },

  refresh: async (refreshToken: string) => {
    return apiRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },
};

// Dashboard Services
export const dashboardService = {
  getDashboard: async () => {
    return apiRequest('/mobile/dashboard');
  },

  getProfile: async () => {
    return apiRequest('/mobile/profile');
  },
};

// Tasks Services
export const tasksService = {
  getTasks: async (params?: { status?: string; page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiRequest(`/mobile/tasks${query ? `?${query}` : ''}`);
  },

  getTaskByQR: async (qrCode: string) => {
    return apiRequest(`/mobile/scan/${qrCode}`);
  },
};

// Collection Services
export const collectionService = {
  submitCollection: async (data: {
    assignment_id: string;
    can_id: string;
    amount: number;
    payment_method: 'CASH' | 'TRANSFER';
    transfer_receipt_url?: string;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: {
      model: string;
      os_version: string;
      app_version: string;
    };
    offline_id?: string;
  }) => {
    return apiRequest('/mobile/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmit: async (collections: Array<{
    offline_id: string;
    assignment_id: string;
    can_id: string;
    amount: number;
    payment_method: 'CASH' | 'TRANSFER';
    collected_at: string;
    latitude?: number;
    longitude?: number;
  }>) => {
    return apiRequest('/mobile/collections/batch', {
      method: 'POST',
      body: JSON.stringify({ collections }),
    });
  },

  getSyncStatus: async () => {
    return apiRequest('/mobile/sync/status');
  },
};

// Network Check
export const networkService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

export default {
  auth: authService,
  dashboard: dashboardService,
  tasks: tasksService,
  collection: collectionService,
  network: networkService,
};