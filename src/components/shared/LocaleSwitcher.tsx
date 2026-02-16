'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { locales, type Locale } from '@/i18n/config';

const localeLabels: Record<Locale, { label: string; flag: string }> = {
  'fr-FR': { label: 'Français (France)', flag: '🇫🇷' },
  'fr-CA': { label: 'Français (Canada)', flag: '🇨🇦' },
  'en-US': { label: 'English (US)', flag: '🇺🇸' },
  'en-GB': { label: 'English (UK)', flag: '🇬🇧' },
  'en-AU': { label: 'English (Australia)', flag: '🇦🇺' },
  'en-CA': { label: 'English (Canada)', flag: '🇨🇦' },
  'en-IE': { label: 'English (Ireland)', flag: '🇮🇪' },
  'es-ES': { label: 'Español (España)', flag: '🇪🇸' },
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="relative flex items-center">
      <Globe className="absolute left-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
      <select
        value={locale}
        onChange={handleChange}
        className="w-full h-9 pl-8 pr-3 text-xs bg-transparent border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
      >
        {locales.map((loc) => {
          const info = localeLabels[loc];
          return (
            <option key={loc} value={loc}>
              {info.flag} {info.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
