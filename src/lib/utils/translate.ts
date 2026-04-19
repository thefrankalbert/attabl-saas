/**
 * Returns the English translation if the current language is English and the
 * translation exists, otherwise falls back to the French value.
 */
export function getTranslatedContent(language: string, fr: string, en?: string | null): string {
  return language === 'en' && en ? en : fr;
}
