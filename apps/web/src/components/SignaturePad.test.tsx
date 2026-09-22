import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad } from './SignaturePad';

describe('SignaturePad (C1-T10, L3)', () => {
  it('render kanvas + tombol hapus + teks kosong', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    expect(screen.getByLabelText('Kanvas tanda tangan')).toBeTruthy();
    expect(screen.getByText('Hapus')).toBeTruthy();
    expect(screen.getByText(/Coret tanda tangan di atas/)).toBeTruthy();
  });

  it('tombol hapus memanggil onChange(null)', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    // Button merender ganda (varian responsif) — klik semuanya, efek sama.
    for (const btn of screen.getAllByRole('button', { name: 'Hapus' })) {
      fireEvent.click(btn);
    }
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
