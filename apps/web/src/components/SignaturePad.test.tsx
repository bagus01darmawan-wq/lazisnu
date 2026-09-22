import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad } from './SignaturePad';

// M3 (review-T11): jsdom tak punya getContext — mock 2d minimal agar jalur
// down/move/up/emit tercakup (bukan hanya render + hapus).
function mockCanvas2d() {
  const calls: { moveTo: number[][]; lineTo: number[][]; stroke: number; clearRect: number; toDataURL: number } = {
    moveTo: [],
    lineTo: [],
    stroke: 0,
    clearRect: 0,
    toDataURL: 0,
  };
  const ctx = {
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => {
      calls.moveTo.push([x, y]);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      calls.lineTo.push([x, y]);
    }),
    stroke: vi.fn(() => {
      calls.stroke += 1;
    }),
    clearRect: vi.fn(() => {
      calls.clearRect += 1;
    }),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) => {
    if (id !== '2d') return null;
    return ctx;
  }) as typeof HTMLCanvasElement.prototype.getContext);
  const toDataURL = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  return { calls, toDataURL };
}

describe('SignaturePad (C1-T10, L3; gambar: M3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
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

  it('coretan down→move→up memanggil onChange(base64 png)', () => {
    mockCanvas2d();
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.pointerDown(canvas!, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas!, { clientX: 30, clientY: 25, pointerId: 1 });
    fireEvent.pointerUp(canvas!, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [b64] = onChange.mock.calls[0] as [string];
    expect(typeof b64).toBe('string');
    // Mock 1x1 → 96 char; yang penting: dipotong prefix data-URL + valid PNG.
    expect(b64.length).toBeGreaterThan(50);
    expect(b64.startsWith('data:')).toBe(false);
    // Round-trip base64 valid.
    expect(Buffer.from(b64, 'base64').subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
