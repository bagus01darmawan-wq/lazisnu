/**
 * C1-T10 — Encoder PNG tanda tangan (murni, nol dep).
 *
 * Coretan jari/stylus direkam sebagai polyline, diraster ke grid grayscale,
 * lalu dienkode PNG (signature + IHDR + IDAT + IEND) dengan DEFLATE blok
 * *stored* (BTYPE=00, tanpa kompresi) + CRC32/Adler32 tulisan tangan —
 * tanpa pako/fflate/view-shot (tak ada di dep mobile; instalasi native baru
 * tak bisa diverifikasi tanpa device farm di sesi ini).
 *
 * Grid default 240×120 → IDAT ≈ 29KB → base64 ≈ 39K karakter: lolos guard
 * server (PNG magic + ≤50KB, `parseSignaturePng` T5). Latar putih (255),
 * tinta hitam (0), brush lingkaran r=2 grid-px.
 */

export interface StrokePoint {
  x: number;
  y: number;
}

export type Stroke = StrokePoint[];

export const SIGN_GRID_W = 240;
export const SIGN_GRID_H = 120;
const BRUSH_R = 2;

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function adler32(bytes: Uint8Array): number {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  const typeBytes = [
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ];
  const body = [...typeBytes, ...data];
  return [...u32be(data.length), ...body, ...u32be(crc32(new Uint8Array(body)))];
}

/** Rasterisasi polyline ke buffer grayscale (0 = tinta, 255 = kertas). */
export function rasterizeStrokes(
  strokes: Stroke[],
  viewW: number,
  viewH: number,
  gridW = SIGN_GRID_W,
  gridH = SIGN_GRID_H,
): Uint8Array {
  const buf = new Uint8Array(gridW * gridH).fill(255);
  if (viewW <= 0 || viewH <= 0) return buf;
  const sx = gridW / viewW;
  const sy = gridH / viewH;

  const stamp = (gx: number, gy: number) => {
    for (let dy = -BRUSH_R; dy <= BRUSH_R; dy++) {
      for (let dx = -BRUSH_R; dx <= BRUSH_R; dx++) {
        if (dx * dx + dy * dy > BRUSH_R * BRUSH_R) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x >= 0 && x < gridW && y >= 0 && y < gridH) buf[y * gridW + x] = 0;
      }
    }
  };

  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      stamp(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps));
    }
  };

  for (const stroke of strokes) {
    const pts = stroke.map(p => ({x: p.x * sx, y: p.y * sy}));
    if (pts.length === 1) {
      stamp(Math.round(pts[0]!.x), Math.round(pts[0]!.y));
    } else {
      for (let i = 1; i < pts.length; i++) {
        seg(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
      }
    }
  }
  return buf;
}

/** True bila ada minimal 1 piksel tinta (coretan tak kosong). */
export function hasInk(pixels: Uint8Array): boolean {
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== 255) return true;
  }
  return false;
}

/** Encode buffer grayscale → bytes PNG (gray 8-bit, filter 0 per baris). */
export function encodePngGray(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (w + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    raw.set(pixels.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  }
  // zlib: header 0x78 0x01 + 1 blok stored (BFINAL=1, BTYPE=00) + Adler32.
  if (raw.length > 65535) throw new Error('Grid terlalu besar untuk 1 blok stored');
  const len = raw.length;
  const zlib: number[] = [
    0x78,
    0x01,
    0x01,
    len & 0xff,
    (len >>> 8) & 0xff,
    ~len & 0xff,
    (~len >>> 8) & 0xff,
    ...Array.from(raw),
    ...u32be(adler32(raw)),
  ];
  const out: number[] = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...u32be(w), ...u32be(h), 8, 0, 0, 0, 0]),
    ...chunk('IDAT', zlib),
    ...chunk('IEND', []),
  ];
  return new Uint8Array(out);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 tanpa Buffer (RN Hermes tak punya Buffer global). */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[a >> 2]!;
    out += B64[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)]! : '=';
    out += i + 2 < bytes.length ? B64[c & 63]! : '=';
  }
  return out;
}

/**
 * Satu pintu: strokes (koordinat view) → base64 PNG siap `signature_png`.
 * Coretan kosong → null (pemanggil wajib menolak sebelum kirim).
 */
export function strokesToSignaturePng(
  strokes: Stroke[],
  viewW: number,
  viewH: number,
): string | null {
  const pixels = rasterizeStrokes(strokes, viewW, viewH);
  if (!hasInk(pixels)) return null;
  return toBase64(encodePngGray(pixels, SIGN_GRID_W, SIGN_GRID_H));
}
