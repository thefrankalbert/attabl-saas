import * as Sentry from '@sentry/nextjs';

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
   * Log info. In production, sends to Sentry as an info breadcrumb.
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
};
