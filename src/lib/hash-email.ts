import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Short, stable pseudonym of an e-mail address for the logs (never the address
 * itself). Server only: it lived in logger.ts, which browser components also
 * import, and its node:crypto import pulled crypto-browserify, buffer, stream
 * and vm polyfills (475 KB) into the visitors' JavaScript (measured 2026-11-20).
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}
