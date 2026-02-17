export const locales = [
  'fr-FR',
  'fr-CA',
  'en-US',
  'en-GB',
  'en-AU',
  'en-CA',
  'en-IE',
  'es-ES',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr-FR';

export const languageFallbacks: Record<string, Locale> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
};
