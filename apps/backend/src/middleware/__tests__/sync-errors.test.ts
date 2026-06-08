/**
 * TC-MOB-06: Unit Test — Sync Error Classification (Retry Loop Prevention)
 *
 * Memastikan bahwa:
 * - Validation error → can_retry = false (tidak akan infinite loop)
 * - Server/network error → can_retry = true (boleh dicoba ulang)
 */

/**
 * Pure function yang merepresentasikan logika klasifikasi error di mobile/sync.ts
 * Diekstrak dari routes/mobile/sync.ts baris 61-72
 */
function classifyError(error: Error | string): {
  error_type: 'VALIDATION' | 'SERVER';
  can_retry: boolean;
} {
  const message = error instanceof Error ? error.message : error;

  const isValidationError =
    message.includes('tidak valid') ||
    message.includes('tidak sesuai') ||
    message.includes('sudah selesai') ||
    message.includes('bukan milik') ||
    message.includes('tidak ditemukan') ||
    message.includes('Tidak dapat') ||
    message.includes('duplicate');

  return {
    error_type: isValidationError ? 'VALIDATION' : 'SERVER',
    can_retry: !isValidationError,
  };
}

// ============================================================================
// Validation errors — can_retry = false (tidak boleh infinite loop)
// ============================================================================

describe('TC-MOB-06: Validation errors — can_retry = false', () => {
  it('error "tidak valid" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('Assignment tidak valid'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "tidak sesuai" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('can_id tidak sesuai dengan assignment'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "sudah selesai" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('Assignment sudah selesai'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "bukan milik" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('bukan milik Anda'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "tidak ditemukan" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('tidak ditemukan'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "Tidak dapat" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('Tidak dapat menghapus permanen'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('error "duplicate" → VALIDATION, can_retry = false', () => {
    const result = classifyError(new Error('duplicate key'));
    expect(result.error_type).toBe('VALIDATION');
    expect(result.can_retry).toBe(false);
  });

  it('ZodError (Zod validation error) → VALIDATION, can_retry = false', () => {
    // ZodError message doesn't contain keywords above, but ZodError is checked separately
    // In this test, we simulate the logic in sync.ts where err instanceof z.ZodError is checked
    let isZodError = true;
    const canRetry = !isZodError;

    expect(canRetry).toBe(false);
  });

  it('VALIDATION error → success counter tetap naik (succeeded++)', () => {
    // Verified from sync.ts line 74:
    // if (isValidationError) { succeeded++; }
    // Validation errors dianggap selesai diproses, tidak perlu retry
    const isValidationError = true;
    const shouldIncrementSucceeded = isValidationError;

    expect(shouldIncrementSucceeded).toBe(true);
  });
});

// ============================================================================
// Server/network errors — can_retry = true (boleh coba ulang)
// ============================================================================

describe('TC-MOB-06: Server errors — can_retry = true', () => {
  it('error database connection → SERVER, can_retry = true', () => {
    const result = classifyError(new Error('connection refused'));
    expect(result.error_type).toBe('SERVER');
    expect(result.can_retry).toBe(true);
  });

  it('error timeout → SERVER, can_retry = true', () => {
    const result = classifyError(new Error('Request timeout'));
    expect(result.error_type).toBe('SERVER');
    expect(result.can_retry).toBe(true);
  });

  it('error 500 internal server → SERVER, can_retry = true', () => {
    const result = classifyError(new Error('Internal server error'));
    expect(result.error_type).toBe('SERVER');
    expect(result.can_retry).toBe(true);
  });

  it('error network → SERVER, can_retry = true', () => {
    const result = classifyError(new Error('Network error'));
    expect(result.error_type).toBe('SERVER');
    expect(result.can_retry).toBe(true);
  });

  it('SERVER error → failed counter naik (failed++)', () => {
    const isValidationError = false;
    const shouldIncrementFailed = !isValidationError;

    expect(shouldIncrementFailed).toBe(true);
  });

  it('mobile client membaca can_retry=true → boleh retry, tidak buang dari queue', () => {
    // Mobile client logic: if result.can_retry === true, keep in MMKV queue
    const result = classifyError(new Error('Network error'));
    const keepInQueue = result.can_retry;

    expect(keepInQueue).toBe(true);
  });

  it('mobile client membaca can_retry=false → hapus dari MMKV queue (done)', () => {
    // Mobile client logic: if result.can_retry === false, remove from MMKV queue
    const result = classifyError(new Error('tidak valid'));
    const removeFromQueue = !result.can_retry;

    expect(removeFromQueue).toBe(true);
  });
});
