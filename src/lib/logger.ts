import * as Sentry from '@sentry/nextjs';
import { createHash } from 'crypto';

/**
 * Centralized logger utility.
 * - Development: logs to console
 * - Production: sends to Sentry
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('Payment failed', error, { orderId: '123' });
 *   logger.warn('Slow query detected', { duration: 5000 });
 *   logger.info('User signed up', { tenantId: 'abc' });
 */

/**
 * Hash an email for logging. Returns the first 12 hex chars of a SHA-256
 * digest, which is unique enough to correlate events about the same email
 * while making it non-reversible and non-PII.
 * Use this instead of logging raw email addresses.
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

const isDev = process.env.NODE_ENV === 'development';

type LogContext = Record<string, unknown>;

export const logger = {
  /**
   * Log an error. In production, sends to Sentry as an exception.
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error, context);
      return;
    }

    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: { message, ...context },
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: { error, ...context },
      });
    }
  },

  /**
   * Log a warning. In production, sends to Sentry as a warning message.
   */
  warn(message: string, context?: LogContext): void {
    if (isDev) {
      console.warn(`[WARN] ${message}`, context);
      return;
    }

    Sentry.captureMessage(message, {
      level: 'warning',
      extra: context,
    });
  },

  /**
   * Log info. In production, creates a Sentry breadcrumb (visible if a
   * subsequent error occurs). Use logger.event() for important business
   * events that should always be visible in Sentry.
   */
  info(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(`[INFO] ${message}`, context);
      return;
    }

    Sentry.addBreadcrumb({
      message,
      level: 'info',
      data: context,
    });
  },

  /**
   * Log an important business event. In production, sends to Sentry as
   * an info-level message (visible in the Issues dashboard).
   * Use sparingly - each call creates a billable Sentry event.
   */
  event(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(`[EVENT] ${message}`, context);
      return;
    }

    Sentry.captureMessage(message, {
      level: 'info',
      extra: context,
    });
  },
};
