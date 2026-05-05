'use server';

import { cookies } from 'next/headers';
import { locales, type Locale } from '@/i18n/config';

export async function actionSetLocale(locale: string): Promise<void> {
  if (!locales.includes(locale as Locale)) return;
  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
