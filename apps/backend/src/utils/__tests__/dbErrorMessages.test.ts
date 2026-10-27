import { translateDatabaseError } from '../dbErrorMessages';
import { ErrorCode } from '../errorCatalog';

/**
 * Error berbentuk yang dikirim driver `postgres` (punya code + constraint).
 */
function makePostgresError(code: string, constraint?: string, detail?: string) {
  const err = new Error('database error');
  return Object.assign(err, { code, constraint, detail });
}

/**
 * drizzle-orm (>= 0.44) membungkus error driver dalam DrizzleQueryError:
 * `code`/`constraint` pindah ke `cause`. Bentuk ini WAJIB ikut diuji karena
 * inilah yang sebenarnya sampai ke `sendInternalError` di produksi.
 */
function wrapLikeDrizzle(cause: unknown) {
  const wrapped = new Error('Failed query: delete from "cans"');
  Object.assign(wrapped, { query: 'delete from "cans"', cause });
  return wrapped;
}

describe('translateDatabaseError — foreign key (23503)', () => {
  it('kaleng yang punya riwayat penjemputan dijelaskan, bukan 500', () => {
    const result = translateDatabaseError(
      makePostgresError('23503', 'collections_can_id_cans_id_fk'),
    );

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.code).toBe(ErrorCode.DATA_IN_USE);
    expect(result!.message).toContain('riwayat penjemputan');
  });

  it('kaleng yang masih tercatat di draft penugasan menyebut draft', () => {
    const result = translateDatabaseError(
      makePostgresError('23503', 'period_draft_items_can_id_cans_id_fk'),
    );

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.message).toContain('draft penugasan');
  });

  it('meng-unwrap DrizzleQueryError (constraint ada di cause)', () => {
    const result = translateDatabaseError(
      wrapLikeDrizzle(makePostgresError('23503', 'period_draft_items_can_id_cans_id_fk')),
    );

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.message).toContain('draft penugasan');
  });

  it('constraint tak dikenal tetap 409 dengan kalimat umum yang benar', () => {
    const result = translateDatabaseError(
      makePostgresError('23503', 'tabel_baru_yang_belum_didaftar_fk'),
    );

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.message).toContain('masih dipakai oleh data lain');
  });
});

describe('translateDatabaseError — nilai unik (23505)', () => {
  it('nomor QR bentrok dijelaskan apa yang harus dilakukan', () => {
    const result = translateDatabaseError(
      makePostgresError('23505', 'cans_qr_code_unique'),
    );

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.code).toBe(ErrorCode.DUPLICATE_DATA);
    expect(result!.message).toContain('Nomor QR');
  });

  it('constraint unik tak dikenal memakai kalimat umum', () => {
    const result = translateDatabaseError(makePostgresError('23505'));

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.message).toContain('nilai yang sama sudah ada');
  });
});

describe('translateDatabaseError — isian wajib & format', () => {
  it('23502 menjadi 400, bukan 500', () => {
    const result = translateDatabaseError(makePostgresError('23502'));

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(400);
    expect(result!.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('22P02 (format tidak dikenali) menjadi 400', () => {
    const result = translateDatabaseError(makePostgresError('22P02'));

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(400);
  });
});

describe('translateDatabaseError — konflik transaksi', () => {
  it('40001 menjadi 409 yang boleh diulang', () => {
    const result = translateDatabaseError(makePostgresError('40001'));

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(409);
    expect(result!.code).toBe(ErrorCode.CONFLICT);
    expect(result!.isRetryable).toBe(true);
  });
});

describe('translateDatabaseError — yang TIDAK boleh diterjemahkan', () => {
  it('error infrastruktur (koneksi) tetap null → jalur 500', () => {
    expect(translateDatabaseError(makePostgresError('08006'))).toBeNull();
  });

  it('error umum / non-error tetap null', () => {
    expect(translateDatabaseError(new Error('boom'))).toBeNull();
    expect(translateDatabaseError(null)).toBeNull();
    expect(translateDatabaseError(undefined)).toBeNull();
    expect(translateDatabaseError('23503')).toBeNull();
  });

  it('detail mesin dibawa untuk log, bukan untuk pesan', () => {
    const result = translateDatabaseError(
      makePostgresError('23503', 'collections_can_id_cans_id_fk'),
    );

    expect(result!.details).toEqual({
      db_code: '23503',
      constraint: 'collections_can_id_cans_id_fk',
    });
    expect(result!.message).not.toContain('collections_can_id_cans_id_fk');
  });
});
