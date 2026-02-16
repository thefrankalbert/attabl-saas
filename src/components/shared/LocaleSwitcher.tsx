'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  const handleChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  const current = localeLabels[locale as Locale];

  return (
    <Select value={locale} onValueChange={handleChange}>
      <SelectTrigger className="w-full h-9 text-xs bg-transparent border-gray-200 text-gray-600 hover:bg-gray-50 focus:ring-0 focus:ring-offset-0">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-gray-400" />
          <SelectValue>{current ? `${current.flag} ${current.label}` : locale}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {locales.map((loc) => {
          const info = localeLabels[loc];
          return (
            <SelectItem key={loc} value={loc} className="text-xs">
              <span className="flex items-center gap-2">
                <span>{info.flag}</span>
                <span>{info.label}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
