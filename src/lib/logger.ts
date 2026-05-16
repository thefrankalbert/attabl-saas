import * as Sentry from '@sentry/nextjs';
import { createHash } from 'crypto';

function getSentryTraceId(): string | undefined {
  try {
    const span = Sentry.getActiveSpan?.();
    return span?.spanContext?.().traceId;
  } catch {
    return undefined;
  }
}

function resolveCorrelationId(context?: LogContext): string | undefined {
  const fromContext = context?.correlationId;
  if (typeof fromContext === 'string' && fromContext.length > 0) {
    return fromContext;
  }
  return getSentryTraceId();
}

/**
 * Centralized logger utility.
 * - Development: logs to console
 * - Production: structured JSON to stdout + Sentry
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('Payment failed', error, { orderId: '123' });
 */

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

const isDev = process.env.NODE_ENV === 'development';

type LogLevel = 'error' | 'warn' | 'info' | 'event';
type LogContext = Record<string, unknown>;

function buildLogPayload(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const correlationId = resolveCorrelationId(context);
  if (correlationId) {
    payload.correlationId = correlationId;
  }

  if (error instanceof Error) {
    payload.error = {
      name: error.name,
      message: error.message,
    };
  } else if (error !== undefined) {
    payload.error = error;
  }

  return payload;
}

function writeStructuredLog(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): void {
  const payload = buildLogPayload(level, message, context, error);
  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

function sendToSentry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): void {
  const extra = { ...context };
  const correlationId = resolveCorrelationId(context);
  if (correlationId) {
    extra.correlationId = correlationId;
  }

  if (level === 'error') {
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message, ...extra } });
    } else {
      Sentry.captureMessage(message, { level: 'error', extra: { error, ...extra } });
    }
    return;
  }

  if (level === 'warn') {
    Sentry.captureMessage(message, { level: 'warning', extra });
    return;
  }

  if (level === 'event') {
    Sentry.captureMessage(message, { level: 'info', extra });
    return;
  }

  Sentry.addBreadcrumb({ message, level: 'info', data: extra });
}

export const logger = {
  error(message: string, error?: unknown, context?: LogContext): void {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error, context);
      return;
    }
    writeStructuredLog('error', message, context, error);
    sendToSentry('error', message, context, error);
  },

  warn(message: string, context?: LogContext): void {
    if (isDev) {
      console.warn(`[WARN] ${message}`, context);
      return;
    }
    writeStructuredLog('warn', message, context);
    sendToSentry('warn', message, context);
  },

  info(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(`[INFO] ${message}`, context);
      return;
    }
    writeStructuredLog('info', message, context);
    sendToSentry('info', message, context);
  },

  event(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(`[EVENT] ${message}`, context);
      return;
    }
    writeStructuredLog('event', message, context);
    sendToSentry('event', message, context);
  },
};
