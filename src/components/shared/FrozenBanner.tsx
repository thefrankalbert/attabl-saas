import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function FrozenBanner({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations('trial');
  return (
    <div className="bg-status-error/10 border-b border-status-error/20 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 text-status-error shrink-0" />
        <p className="text-xs sm:text-sm font-medium text-status-error truncate">{t('expired')}</p>
      </div>
      <Link
        href={`/sites/${tenantSlug}/admin/subscription`}
        className="shrink-0 bg-status-error text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
      >
        {t('seePlans')}
      </Link>
    </div>
  );
}
