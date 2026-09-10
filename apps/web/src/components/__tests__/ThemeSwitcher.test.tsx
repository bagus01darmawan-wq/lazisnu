import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import ThemeSwitcher from '@/components/ThemeSwitcher';

function Harness() {
  const { theme } = useTheme();
  return (
    <>
      <ThemeSwitcher />
      <span data-testid="current">{theme}</span>
    </>
  );
}

describe('ThemeSwitcher', () => {
  afterEach(cleanup);

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    // jsdom di CI kadang tak punya localStorage (tanpa --localstorage-file) → stub mini.
    if (!window.localStorage) {
      const store: Record<string, string> = {};
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => (k in store ? store[k] : null),
          setItem: (k: string, v: string) => { store[k] = String(v); },
          clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        },
      });
    }
    window.localStorage.clear();
  });

  it('default theme is sawah-fajar and canvas var resolves', () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>
    );
    expect(screen.getByTestId('current').textContent).toBe('sawah-fajar');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('clicking a theme sets data-theme on <html> and persists to localStorage', () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>
    );
    // buka popover
    fireEvent.click(screen.getByRole('button', { name: /ganti tema/i }));
    // klik tema "Neon Fajar"
    const btn = screen.getByRole('menuitemradio', { name: /Neon Fajar/i });
    fireEvent.click(btn);

    expect(document.documentElement.dataset.theme).toBe('neon-fajar');
    expect(window.localStorage.getItem('lazisnu-theme')).toBe('neon-fajar');
    expect(screen.getByTestId('current').textContent).toBe('neon-fajar');
  });

  it('all 15 themes are present in the picker', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /ganti tema/i }));
    const names = [
      'Sawah Fajar','Lautan Tenang','Senja NU','Batik Malam','Hutan Hujan',
      'Terracotta Jawa','Langit Biru','Anggrek Ungu','Kopi Tubruk','Pasir Pantai',
      'Merah Putih','Gelap Elegan','Sakura Senja','Zaitun Mediterania','Neon Fajar',
    ];
    for (const n of names) {
      expect(screen.getByRole('menuitemradio', { name: new RegExp(n, 'i') })).toBeTruthy();
    }
  });
});
