import {inflateSync} from 'node:zlib';
import {
  adler32,
  crc32,
  encodePngGray,
  hasInk,
  rasterizeStrokes,
  strokesToSignaturePng,
  toBase64,
  SIGN_GRID_W,
  SIGN_GRID_H,
} from '../../src/signature/signaturePng';

function parsePng(bytes: Uint8Array) {
  // Signature 8 byte, lalu deret chunk: len(4BE) + type(4) + data + crc(4BE).
  expect(Array.from(bytes.subarray(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const chunks: Array<{type: string; data: Uint8Array}> = [];
  let o = 8;
  while (o < bytes.length) {
    const len = (bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!;
    const type = String.fromCharCode(bytes[o + 4]!, bytes[o + 5]!, bytes[o + 6]!, bytes[o + 7]!);
    const data = bytes.subarray(o + 8, o + 8 + len);
    const crcWant =
      ((bytes[o + 8 + len]! << 24) |
        (bytes[o + 9 + len]! << 16) |
        (bytes[o + 10 + len]! << 8) |
        bytes[o + 11 + len]!) >>>
      0;
    const crcBody = new Uint8Array(4 + len);
    crcBody.set(bytes.subarray(o + 4, o + 8 + len));
    expect(crc32(crcBody)).toBe(crcWant);
    chunks.push({type, data});
    o += 12 + len;
  }
  return chunks;
}

describe('C1-T10 signaturePng (encoder murni)', () => {
  const strokes = [
    [
      {x: 10, y: 10},
      {x: 100, y: 60},
      {x: 200, y: 20},
    ],
  ];

  test('raster berisi tinta; kosong → tak ada tinta', () => {
    const px = rasterizeStrokes(strokes, 300, 150);
    expect(px.length).toBe(SIGN_GRID_W * SIGN_GRID_H);
    expect(hasInk(px)).toBe(true);
    expect(hasInk(rasterizeStrokes([], 300, 150))).toBe(false);
    expect(hasInk(rasterizeStrokes([[{x: -50, y: -50}]], 300, 150))).toBe(false);
  });

  test('PNG valid: signature + IHDR 240×120 gray8 + CRC + inflate cocok piksel', () => {
    const px = rasterizeStrokes(strokes, 300, 150);
    const png = encodePngGray(px, SIGN_GRID_W, SIGN_GRID_H);
    expect(png.length).toBeLessThan(50 * 1024);
    const chunks = parsePng(png);
    expect(chunks.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = chunks[0]!.data;
    expect((ihdr[0]! << 24) | (ihdr[1]! << 16) | (ihdr[2]! << 8) | ihdr[3]!).toBe(SIGN_GRID_W);
    expect((ihdr[4]! << 24) | (ihdr[5]! << 16) | (ihdr[6]! << 8) | ihdr[7]!).toBe(SIGN_GRID_H);
    expect(ihdr[8]).toBe(8);
    expect(ihdr[9]).toBe(0);
    // Inflate IDAT (zlib) → filter 0 per baris → piksel identik.
    const raw = Buffer.from(inflateSync(Buffer.from(chunks[1]!.data)));
    expect(raw.length).toBe(SIGN_GRID_H * (SIGN_GRID_W + 1));
    const flat = Buffer.alloc(SIGN_GRID_W * SIGN_GRID_H);
    for (let y = 0; y < SIGN_GRID_H; y++) {
      expect(raw[y * (SIGN_GRID_W + 1)]).toBe(0);
      raw.copy(flat, y * SIGN_GRID_W, y * (SIGN_GRID_W + 1) + 1, (y + 1) * (SIGN_GRID_W + 1));
    }
    expect(Buffer.from(px)).toEqual(flat);
    // Adler32 ekor zlib cocok (atas data mentah, tanpa header blok stored).
    const zdata = Buffer.from(chunks[1]!.data);
    const rawOnly = zdata.subarray(2 + 5, zdata.length - 4);
    const adlerWant = zdata.readUInt32BE(zdata.length - 4);
    expect(adler32(new Uint8Array(rawOnly))).toBe(adlerWant);
  });

  test('base64 round-trip + pintu strokesToSignaturePng', () => {
    const b64 = strokesToSignaturePng(strokes, 300, 150);
    expect(typeof b64).toBe('string');
    expect(b64!.length).toBeGreaterThan(100);
    const back = Buffer.from(b64!, 'base64');
    expect(back[0]).toBe(0x89);
    expect(back[1]).toBe(0x50);
    expect(strokesToSignaturePng([], 300, 150)).toBeNull();
  });

  test('toBase64 cocok dengan Buffer bawaan', () => {
    const sample = new Uint8Array([0, 1, 2, 250, 255, 16, 32, 48, 64]);
    expect(toBase64(sample)).toBe(Buffer.from(sample).toString('base64'));
  });
});
