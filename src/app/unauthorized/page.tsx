import Link from 'next/link';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
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
            className="inline-flex items-center justify-center h-11 px-6 bg-accent text-accent-text font-bold rounded-[10px] hover:bg-accent-hover transition-colors"
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
      </div>
    </div>
  );
}
