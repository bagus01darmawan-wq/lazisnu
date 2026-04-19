import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Add Token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('lazisnu_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle Errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Handle Unauthorized (e.g., redirect to login if not already there)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        Cookies.remove('lazisnu_token');
        Cookies.remove('user_role');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
