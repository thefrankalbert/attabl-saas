import { sanitizeTypography } from './sanitize-typography';

/**
 * Returns the English translation if the current language is English and the
 * translation exists, otherwise falls back to the French value. Tenant-entered
 * content is sanitized so forbidden typography (em-dash, smart quotes...) never
 * reaches the UI.
 */
export function getTranslatedContent(language: string, fr: string, en?: string | null): string {
  return sanitizeTypography(language === 'en' && en ? en : fr);
}
