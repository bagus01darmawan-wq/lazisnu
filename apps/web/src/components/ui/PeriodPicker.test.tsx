import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodPicker } from './PeriodPicker';

describe('PeriodPicker — disableFuture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const openPicker = () => {
    const trigger = screen.getAllByRole('button')[0]!;
    fireEvent.click(trigger);
  };

  it('menonaktifkan bulan setelah bulan berjalan', () => {
    render(<PeriodPicker months={[11]} year={2026} onChange={() => {}} disableFuture />);
    openPicker();

    expect((screen.getByRole('button', { name: 'Pilih November' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Pilih Desember' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Desember' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('tidak menawarkan tahun setelah tahun berjalan', () => {
    render(<PeriodPicker months={[11]} year={2026} onChange={() => {}} disableFuture />);
    openPicker();

    expect(screen.queryByRole('button', { name: '2027' })).toBeNull();
    expect(screen.getByRole('button', { name: '2026' })).toBeTruthy();
  });

  it('tanpa disableFuture tetap menawarkan tahun berikutnya (perilaku lama)', () => {
    render(<PeriodPicker months={[11]} year={2026} onChange={() => {}} />);
    openPicker();

    expect(screen.getByRole('button', { name: '2027' })).toBeTruthy();
  });
});
