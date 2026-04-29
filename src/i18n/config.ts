export const locales = ['fr-FR', 'en-US'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr-FR';

export const languageFallbacks: Record<string, Locale> = {
  fr: 'fr-FR',
  en: 'en-US',
};

export const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  'fr-FR': { label: 'Français', flag: '🇫🇷' },
  'en-US': { label: 'English', flag: '🇺🇸' },
};
