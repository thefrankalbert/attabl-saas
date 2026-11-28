import * as Sentry from '@sentry/nextjs';

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

const isDev = process.env.NODE_ENV === 'development';

type LogLevel = 'error' | 'warn' | 'info' | 'event';
type LogContext = Record<string, unknown>;

/**
 * K5.3: aucune valeur secrete ne part dans les journaux, meme si un appelant
 * passe en contexte un objet qui en contient (erreur Supabase, en-tetes,
 * reponse d'un prestataire). La valeur des cles sensibles est remplacee, a
 * toute profondeur; les cycles et les objets tres profonds sont coupes.
 */
const SENSITIVE_KEY = /pass(word|wd)?|token|secret|authorization|api[_-]?key|cookie|signature/i;
const MASK = '[masque]';
const MAX_DEPTH = 6;

export function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (seen.has(value)) return '[cycle]';
  if (depth >= MAX_DEPTH) return '[profondeur]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? MASK : redactSecrets(v, depth + 1, seen);
  }
  return out;
}

function redactContext(context?: LogContext): LogContext | undefined {
  return context === undefined ? undefined : (redactSecrets(context) as LogContext);
}

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
  const payload = buildLogPayload(level, message, redactContext(context), redactSecrets(error));
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
  const extra = { ...redactContext(context) };
  const safeError = redactSecrets(error);
  const correlationId = resolveCorrelationId(context);
  if (correlationId) {
    extra.correlationId = correlationId;
  }

  if (level === 'error') {
    if (safeError instanceof Error) {
      Sentry.captureException(safeError, { extra: { message, ...extra } });
    } else {
      Sentry.captureMessage(message, { level: 'error', extra: { error: safeError, ...extra } });
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
      console.error('[ERROR]', message, error, context);
      return;
    }
    writeStructuredLog('error', message, context, error);
    sendToSentry('error', message, context, error);
  },

  warn(message: string, context?: LogContext): void {
    if (isDev) {
      console.warn('[WARN]', message, context);
      return;
    }
    writeStructuredLog('warn', message, context);
    sendToSentry('warn', message, context);
  },

  info(message: string, context?: LogContext): void {
    if (isDev) {
      console.info('[INFO]', message, context);
      return;
    }
    writeStructuredLog('info', message, context);
    sendToSentry('info', message, context);
  },

  event(message: string, context?: LogContext): void {
    if (isDev) {
      console.info('[EVENT]', message, context);
      return;
    }
    writeStructuredLog('event', message, context);
    sendToSentry('event', message, context);
  },
};
