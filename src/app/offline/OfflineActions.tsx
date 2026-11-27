'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Page statique et sans i18n (voir page.tsx): textes en dur par conception.
export function OfflineActions() {
  // "Reconnexion automatique..." doit etre vrai: la page se recharge d'elle-meme
  // des que le navigateur annonce le retour du reseau.
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Button onClick={() => window.location.reload()} className="min-h-[44px]">
        Réessayer
      </Button>
      <Button asChild variant="ghost" className="min-h-[44px]">
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
