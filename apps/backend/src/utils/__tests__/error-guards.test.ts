import { getPostgresError, isPostgresError } from '../error-guards';

/**
 * Membuat error berbentuk DrizzleQueryError (drizzle-orm 0.44+):
 * wrapper tanpa `code`, error driver asli ada di `cause`.
 */
function makeDrizzleQueryError(cause: unknown, query = 'insert into "users"') {
  const wrapped = new Error(`Failed query: ${query}`);
  Object.assign(wrapped, { query, cause });
  return wrapped;
}

function makePostgresError(code: string, detail?: string) {
  const err = new Error('duplicate key value violates unique constraint "users_email_unique"');
  return Object.assign(err, { code, detail });
}

describe('isPostgresError', () => {
  it('mengenali error Postgres mentah (punya code string)', () => {
    expect(isPostgresError(makePostgresError('23505'))).toBe(true);
  });

  it('menolak error umum tanpa code', () => {
    expect(isPostgresError(new Error('boom'))).toBe(false);
    expect(isPostgresError(null)).toBe(false);
    expect(isPostgresError('string')).toBe(false);
  });
});

describe('getPostgresError', () => {
  it('meng-unwrap DrizzleQueryError: kode & detail ada di cause', () => {
    const cause = makePostgresError('23505', 'Key (email)=(082134536151@petugas.lazisnu.id) already exists.');
    const wrapped = makeDrizzleQueryError(cause);

    const pg = getPostgresError(wrapped);

    expect(pg).not.toBeNull();
    expect(pg!.code).toBe('23505');
    expect(pg!.detail).toContain('email');
  });

  it('mengembalikan error Postgres mentah apa adanya (tanpa wrapper)', () => {
    const raw = makePostgresError('23505', 'Key (phone)=(0812) already exists.');

    const pg = getPostgresError(raw);

    expect(pg).not.toBeNull();
    expect(pg!.code).toBe('23505');
  });

  it('mengembalikan null bila cause bukan error Postgres', () => {
    const wrapped = makeDrizzleQueryError(new Error('connection refused'));

    expect(getPostgresError(wrapped)).toBeNull();
  });

  it('mengembalikan null untuk error umum / nilai non-error', () => {
    expect(getPostgresError(new Error('boom'))).toBeNull();
    expect(getPostgresError(null)).toBeNull();
    expect(getPostgresError(undefined)).toBeNull();
    expect(getPostgresError('23505')).toBeNull();
  });
});
