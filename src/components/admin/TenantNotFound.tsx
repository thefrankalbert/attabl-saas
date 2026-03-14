import { getTranslations } from 'next-intl/server';
import { AlertCircle } from 'lucide-react';

export default async function TenantNotFound() {
  const t = await getTranslations('common');

  return (
    <div className="p-8">
      <div className="flex items-start gap-3 p-4 bg-status-error-bg border border-status-error/20 rounded-xl max-w-md">
        <AlertCircle className="h-5 w-5 text-status-error mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-status-error font-bold text-sm">{t('tenantNotFound')}</h3>
          <p className="text-xs text-app-text-secondary mt-1">{t('tenantNotFoundDesc')}</p>
        </div>
      </div>
    </div>
  );
}
