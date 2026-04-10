/**
 * Server-side font validation for the ATTABL curated fonts system.
 *
 * Used by the tenant update service to guarantee that only whitelisted
 * font ids are ever persisted to tenants.font_family. This is a defense
 * layer on top of Zod schemas - never trust the client font value.
 */

import { CURATED_FONTS, type TenantFontId } from '@/lib/config/fonts';

/**
 * Type guard: returns true if the given id matches one of the curated fonts.
 * Accepts any string input (safe for unvalidated client payloads).
 */
export function isValidFont(fontId: string): fontId is TenantFontId {
  if (typeof fontId !== 'string' || fontId.length === 0) {
    return false;
  }
  const normalized = fontId.trim().toLowerCase();
  return CURATED_FONTS.some((font) => font.id === normalized);
}
