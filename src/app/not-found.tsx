import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <p className="text-6xl font-black text-neutral-200">404</p>
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Cette page n&apos;existe pas ou a ete deplacee.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour a l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
