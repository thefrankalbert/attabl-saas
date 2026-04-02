'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { locales, LOCALE_LABELS } from '@/i18n/config';

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
      <Globe className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
      <select
        value={locale}
        onChange={handleChange}
        className="w-full h-9 pl-8 pr-3 text-xs bg-transparent border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
      >
        {locales.map((loc) => {
          const info = LOCALE_LABELS[loc];
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
