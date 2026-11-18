import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import DeleteAccountSection from '@/components/features/settings/DeleteAccountSection';

export default async function UnauthorizedPage() {
  // Un membre du personnel d'un restaurant gele n'atteint QUE cette page (le
  // proxy le renvoie vers /subscription, qu'il ne peut pas ouvrir): c'est donc
  // ici qu'il doit pouvoir supprimer son compte (Apple 5.1.1(v)).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh flex items-center justify-center bg-app-bg px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-status-error-bg">
          <ShieldX className="h-8 w-8 text-status-error" />
        </div>
        <h1 className="text-2xl font-bold text-app-text mb-2">Accès non autorisé</h1>
        <p className="text-sm text-app-text-secondary mb-6">
          Vous n&apos;avez pas les permissions nécessaires pour accéder à cet établissement.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/admin/tenants"
            className="inline-flex items-center justify-center h-11 px-6 bg-accent text-accent-text font-semibold rounded-xl hover:bg-accent-hover transition-colors"
          >
            Mes établissements
          </Link>
          <Link
            href="/login"
            className="text-sm text-app-text-muted hover:text-app-text transition-colors"
          >
            Se reconnecter
          </Link>
        </div>
        {user && (
          <div className="mt-6 text-left">
            <DeleteAccountSection variant="staff" />
          </div>
        )}
      </div>
    </div>
  );
}
