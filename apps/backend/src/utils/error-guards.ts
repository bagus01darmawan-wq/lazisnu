export type ErrorWithMessage = {
  message: string;
};

export type PostgresErrorLike = ErrorWithMessage & {
  code: string;
  detail?: string;
};

export type HttpRouteErrorLike = {
  status: number;
  code: string;
  message: string;
};

export type JwtErrorLike = {
  statusCode?: number;
  code?: string;
};

export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return error instanceof Error || (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan'): string {
  return isErrorWithMessage(error) ? error.message : fallback;
}

export function isPostgresError(error: unknown): error is PostgresErrorLike {
  return isErrorWithMessage(error) &&
    typeof (error as { code?: unknown }).code === 'string';
}

export function isHttpRouteError(error: unknown): error is HttpRouteErrorLike {
  return typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string';
}

export function isJwtErrorLike(error: unknown): error is JwtErrorLike {
  return typeof error === 'object' &&
    error !== null &&
    (
      typeof (error as { statusCode?: unknown }).statusCode === 'number' ||
      typeof (error as { code?: unknown }).code === 'string'
    );
}
