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
import { locales, LOCALE_LABELS } from '@/i18n/config';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const handleChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="relative flex items-center">
      <Globe className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none z-10" />
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger className="w-full h-9 pl-8 pr-3 text-xs bg-transparent border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((loc) => {
            const info = LOCALE_LABELS[loc];
            return (
              <SelectItem key={loc} value={loc}>
                {info.flag} {info.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
