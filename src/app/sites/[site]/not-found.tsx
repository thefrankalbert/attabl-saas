'use client';

import Link from 'next/link';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function TenantNotFound() {
  const params = useParams();
  const site = params?.site as string | undefined;
  const menuHref = site ? `/sites/${site}/menu` : '/';

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-app-border dark:bg-app-elevated">
          <UtensilsCrossed className="h-7 w-7 text-app-text-muted" />
        </div>

        <p className="text-5xl font-black text-app-text-muted">404</p>
        <h1 className="mt-3 text-lg font-semibold text-app-text">Page introuvable</h1>
        <p className="mt-2 text-sm text-app-text-secondary leading-relaxed">
          Cette page n&apos;existe pas. Retournez au menu pour d&eacute;couvrir nos plats.
        </p>

        <Button
          asChild
          className="mt-6 gap-2 w-full"
          style={{ backgroundColor: 'var(--tenant-primary, #000)' }}
        >
          <Link href={menuHref}>
            <ArrowLeft className="h-4 w-4" />
            Retour au menu
          </Link>
        </Button>
      </div>
    </div>
  );
}
