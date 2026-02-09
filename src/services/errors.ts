/**
 * Service layer error types.
 *
 * Services throw ServiceError instead of returning HTTP responses.
 * API routes catch ServiceError and map the code to HTTP status codes.
 */

export type ServiceErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'INTERNAL' | 'AUTH';

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
    case 'AUTH':
      return 403;
    case 'INTERNAL':
      return 500;
  }
}
