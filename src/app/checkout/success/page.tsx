import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import { CheckoutSuccessClient } from './CheckoutSuccessClient';

export const metadata: Metadata = {
  title: 'Votre abonnement - ATTABL',
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <CheckoutSuccessClient isAuthenticated={user !== null} />;
}
