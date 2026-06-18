import axios, { AxiosRequestConfig } from 'axios';
import { authHelper } from './auth';

const defaultApiUrl = process.env.NODE_ENV === 'production' 
  ? (typeof window !== 'undefined' ? window.location.origin : '')
  : 'http://localhost:3001';

// Client-side fail-fast warning in production
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    '[LAZISNU WARNING] NEXT_PUBLIC_API_URL is not defined in production environment. ' +
    'Falling back to window.location.origin, which might cause API requests to fail if the backend is hosted on a different domain.'
  );
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || defaultApiUrl) + '/v1';

const apiInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface Subscriber {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let refreshSubscribers: Subscriber[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((sub) => sub.resolve(token));
  refreshSubscribers = [];
}

function onRefreshFailed(error: unknown) {
  refreshSubscribers.forEach((sub) => sub.reject(error));
  refreshSubscribers = [];
}

function addRefreshSubscriber(sub: Subscriber) {
  refreshSubscribers.push(sub);
}

// Request Interceptor: Add Token
apiInstance.interceptors.request.use(
  (config) => {
    const token = authHelper.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle Errors & Auto Refresh
apiInstance.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber({
            resolve: (token) => {
              originalRequest._retry = true;
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiInstance(originalRequest));
            },
            reject: (err) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Lakukan request ke local Next.js Route Handler
        const refreshRes = await axios.post('/api/auth/refresh');

        const { access_token } = refreshRes.data.data;
        
        authHelper.setToken(access_token);

        isRefreshing = false;
        onRefreshed(access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiInstance(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed(refreshError);
        
        // Refresh gagal, paksa logout
        if (typeof window !== 'undefined') {
          authHelper.removeToken();
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

// Custom interface for auto-unwrap response type safety
export interface CustomAxiosInstance {
  <T = unknown>(config: AxiosRequestConfig): Promise<T>;
  <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
}

const api = apiInstance as unknown as CustomAxiosInstance;
export default api;
