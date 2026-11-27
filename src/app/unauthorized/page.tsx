import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ShieldX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AuthFrame } from '@/components/auth/AuthFrame';
import DeleteAccountSection from '@/components/features/settings/DeleteAccountSection';

export default async function UnauthorizedPage() {
  // Un membre du personnel d'un restaurant gele n'atteint QUE cette page (le
  // proxy le renvoie vers /subscription, qu'il ne peut pas ouvrir): c'est donc
  // ici qu'il doit pouvoir supprimer son compte (Apple 5.1.1(v)).
  const t = await getTranslations('unauthorized');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    // Meme cadre photo que les pages de connexion (AuthFrame). Le conteneur
    // `h-full overflow-y-auto` est le seul qui defile sous 1024px (regle 08).
    <div className="h-full overflow-y-auto">
      <AuthFrame scene="unauthorized">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--err-bg)]">
            <ShieldX className="h-8 w-8 text-[var(--err-fg)]" />
          </div>
          <h1 className="auth-serif auth-title mb-3">{t('title')}</h1>
          <p className="mb-8 text-[15px] leading-relaxed text-[var(--secondary)]">{t('body')}</p>
          <div className="flex flex-col gap-3">
            <Link href="/admin/tenants" className="auth-btn-primary">
              {t('myEstablishments')}
            </Link>
            <Link href="/login" className="auth-link self-center text-sm">
              {t('signInAgain')}
            </Link>
          </div>
          {user && (
            <div className="mt-6 text-left">
              <DeleteAccountSection variant="staff" />
            </div>
          )}
        </div>
      </AuthFrame>
    </div>
  );
}
