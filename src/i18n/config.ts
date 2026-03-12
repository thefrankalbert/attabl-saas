export const locales = ['fr-FR', 'en-US'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr-FR';

export const languageFallbacks: Record<string, Locale> = {
  fr: 'fr-FR',
  en: 'en-US',
};
