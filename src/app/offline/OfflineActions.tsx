'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Page statique et sans i18n (voir page.tsx): textes en dur par conception.
export function OfflineActions() {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Button onClick={() => window.location.reload()} className="min-h-[44px]">
        Reessayer
      </Button>
      <Button asChild variant="ghost" className="min-h-[44px]">
        <Link href="/">Retour a l&apos;accueil</Link>
      </Button>
    </div>
  );
}
