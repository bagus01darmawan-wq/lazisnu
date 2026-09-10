'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export const THEMES = [
  { key: 'sawah-fajar', name: 'Sawah Fajar', canvas: '#2C473E', primary: '#EAD19B', surface: '#F4F1EA' },
  { key: 'lautan-tenang', name: 'Lautan Tenang', canvas: '#0F5E63', primary: '#E8A87C', surface: '#F7F3EC' },
  { key: 'senja-nu', name: 'Senja NU', canvas: '#3B2A4A', primary: '#E0A458', surface: '#F5EBDD' },
  { key: 'batik-malam', name: 'Batik Malam', canvas: '#1A1B3A', primary: '#D4AF37', surface: '#F4F1EA' },
  { key: 'hutan-hujan', name: 'Hutan Hujan', canvas: '#1F3D2B', primary: '#A8C686', surface: '#EAF0E4' },
  { key: 'terracotta-jawa', name: 'Terracotta Jawa', canvas: '#7A3B2E', primary: '#E4B363', surface: '#F3E9DC' },
  { key: 'langit-biru', name: 'Langit Biru', canvas: '#2E5A88', primary: '#F2C94C', surface: '#F5F8FC' },
  { key: 'anggrek-ungu', name: 'Anggrek Ungu', canvas: '#5A4A6A', primary: '#C9B8D4', surface: '#F6F2F4' },
  { key: 'kopi-tubruk', name: 'Kopi Tubruk', canvas: '#3B2417', primary: '#C68B59', surface: '#F0E6D8' },
  { key: 'pasir-pantai', name: 'Pasir Pantai', canvas: '#1F4E54', primary: '#F2A488', surface: '#F7F0E1' },
  { key: 'merah-putih', name: 'Merah Putih', canvas: '#8B1E2D', primary: '#E8C547', surface: '#FBF8F3' },
  { key: 'gelap-elegan', name: 'Gelap Elegan', canvas: '#14161A', primary: '#5EEAD4', surface: '#1E2228' },
  { key: 'sakura-senja', name: 'Sakura Senja', canvas: '#6D4C5B', primary: '#E9B7C0', surface: '#FBEFF1' },
  { key: 'zaitun-mediterania', name: 'Zaitun Mediterania', canvas: '#4A4E1F', primary: '#C97B3C', surface: '#F3EFD9' },
  { key: 'neon-fajar', name: 'Neon Fajar', canvas: '#0B1B3A', primary: '#2DD4BF', surface: '#122244' },
] as const;

export type ThemeKey = (typeof THEMES)[number]['key'];

const STORAGE_KEY = 'lazisnu-theme';

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (key: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => {
    // localStorage bisa tak tersedia (privacy mode / jsdom tanpa storage-file).
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && THEMES.some((t) => t.key === saved)) return saved as ThemeKey;
    } catch { /* storage blocked */ }
    return 'sawah-fajar';
  });

  const setTheme = useCallback((key: ThemeKey) => {
    setThemeState(key);
    document.documentElement.dataset.theme = key;
    try { window.localStorage.setItem(STORAGE_KEY, key); } catch { /* storage blocked */ }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
