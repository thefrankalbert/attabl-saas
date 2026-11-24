'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FR/EN switch. The site i18n is cookie-driven (NEXT_LOCALE, no URL prefix), so we
 * flip the cookie and refresh server components. Label shows the language you switch TO.
 */
export function LocaleToggle({ className, label }: { className?: string; label?: string }) {
  const locale = useLocale();
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale.startsWith('fr') ? 'en-US' : 'fr-FR';
  const shown = label ?? (next.startsWith('en') ? 'EN' : 'FR');

  function switchLocale() {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={switchLocale}
      disabled={pending}
      aria-label={tc(next.startsWith('en') ? 'aria.switchToEnglish' : 'aria.switchToFrench')}
      className={cn(
        'h-auto min-h-11 min-w-11 rounded-lg border-zinc-200 bg-transparent px-2.5 py-[5px] text-[13px] font-semibold text-zinc-600 shadow-none hover:border-zinc-300 hover:bg-transparent hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-50',
        className,
      )}
    >
      {shown}
    </Button>
  );
}
