import { PaginatedResponse } from '@lazisnu/shared-types';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Extract pagination parameters from query string
 */
export function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 10)); // Default 10, max 100
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Format data into standard paginated response
 */
export function formatPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}
