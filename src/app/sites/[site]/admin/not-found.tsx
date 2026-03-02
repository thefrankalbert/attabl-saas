'use client';

import Link from 'next/link';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function AdminNotFound() {
  const params = useParams();
  const site = params?.site as string | undefined;
  const dashboardHref = site ? `/sites/${site}/admin` : '/';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-app-elevated">
          <LayoutDashboard className="h-7 w-7 text-app-text-muted" />
        </div>

        <p className="text-6xl font-black text-app-text-muted">404</p>
        <h1 className="mt-4 text-lg font-semibold text-app-text">Page admin introuvable</h1>
        <p className="mt-2 text-sm text-app-text-secondary leading-relaxed">
          Cette section n&apos;existe pas ou vous n&apos;y avez pas acc&egrave;s.
        </p>

        <Button asChild variant="outline" className="mt-8 gap-2">
          <Link href={dashboardHref}>
            <ArrowLeft className="h-4 w-4" />
            Retour au dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
