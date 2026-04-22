import axios from 'axios';
import Cookies from 'js-cookie';
import { authHelper } from './auth';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

// Request Interceptor: Add Token
api.interceptors.request.use(
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
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = authHelper.getRefreshToken();
      if (refreshToken) {
        try {
          // Lakukan request manual dengan axios polos agar tidak ter-intercept
          const refreshRes = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token: newRefreshToken } = refreshRes.data.data;
          
          authHelper.setToken(access_token);
          if (newRefreshToken) {
            authHelper.setRefreshToken(newRefreshToken);
          }

          isRefreshing = false;
          onRefreshed(access_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          // Refresh gagal, paksa logout
          if (typeof window !== 'undefined') {
            authHelper.removeToken();
            Cookies.remove('user_role');
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        }
      } else {
        isRefreshing = false;
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          authHelper.removeToken();
          Cookies.remove('user_role');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
