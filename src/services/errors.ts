/**
 * Service layer error types.
 *
 * Services throw ServiceError instead of returning HTTP responses.
 * API routes catch ServiceError and map the code to HTTP status codes.
 */

export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'INTERNAL'
  | 'AUTH'
  | 'UNAUTHORIZED';

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ServiceErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * True when a Postgres error is the cross-group tenant-name conflict raised by
 * the enforce_tenant_name_cross_group_unique trigger (migration 20260629020000).
 * The trigger uses SQLSTATE 23505 with this exact message, so we match the
 * message marker to avoid confusing it with a slug unique violation (also 23505).
 */
export function isTenantNameConflictError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes('tenant_name_cross_group_conflict'));
}

/**
 * Maps a ServiceError code to an HTTP status code.
 * Used by API routes to translate service errors into responses.
 */
export function serviceErrorToStatus(code: ServiceErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'VALIDATION':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'AUTH':
      return 403;
    case 'INTERNAL':
      return 500;
  }
}
