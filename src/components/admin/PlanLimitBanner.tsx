import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Bandeau affiche quand un ajout depasse la limite du plan (espaces, membres
 * d'equipe). Decision du proprietaire du 2026-11-21: ce qui existe deja au-dela
 * de la limite continue de fonctionner, seul l'ajout est refuse (cote serveur),
 * et ce bandeau propose le plan superieur.
 */
export function PlanLimitBanner({
  message,
  ctaLabel,
  href,
}: {
  message: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-status-info/30 bg-status-info-bg p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-app-text">{message}</p>
      <Button asChild size="sm" className="min-h-[44px] shrink-0">
        <Link href={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
