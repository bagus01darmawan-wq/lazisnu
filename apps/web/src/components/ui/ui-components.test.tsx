import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {EmptyState} from './EmptyState';
import {Badge} from './Badge';

describe('EmptyState', () => {
  it('menampilkan judul dan deskripsi default', () => {
    render(<EmptyState />);
    expect(screen.getByText('Data tidak ditemukan')).toBeTruthy();
    expect(
      screen.getByText('Maaf, sepertinya belum ada data untuk ditampilkan saat ini.'),
    ).toBeTruthy();
  });

  it('menampilkan judul kustom', () => {
    render(<EmptyState title="Kaleng kosong" />);
    expect(screen.getByText('Kaleng kosong')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('merender children dengan variant default', () => {
    render(<Badge>Aktif</Badge>);
    expect(screen.getByText('Aktif')).toBeTruthy();
  });

  it('menerapkan kelas variant failed', () => {
    const {container} = render(<Badge variant="failed">Gagal</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-red-100');
  });
});
