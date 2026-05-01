import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

type GatedFeature = 'kds' | 'inventory' | 'recipes' | 'reports';

const FEATURE_EVENT_KEY: Record<GatedFeature, string> = {
  kds: 'kds_access_attempted',
  inventory: 'inventory_access_attempted',
  recipes: 'recipes_access_attempted',
  reports: 'reports_access_attempted',
};

interface FeatureUpgradeWallProps {
  feature: GatedFeature;
  checkoutUrl: string;
  tenantId?: string;
}

export async function FeatureUpgradeWall({
  feature,
  checkoutUrl,
  tenantId,
}: FeatureUpgradeWallProps) {
  const t = await getTranslations('admin.upgradeWall');

  if (tenantId) {
    const eventKey = FEATURE_EVENT_KEY[feature];
    const now = new Date().toISOString();
    try {
      const supabase = createAdminClient();
      await supabase
        .from('tenants')
        .update({ activation_events: { [eventKey]: now } })
        .eq('id', tenantId)
        .filter(`activation_events->>${eventKey}`, 'is', null);
    } catch (err) {
      logger.warn('FeatureUpgradeWall: failed to record access event', { feature, tenantId, err });
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 p-8 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-2 max-w-sm">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t('planRequired')}
        </p>
        <h2 className="text-2xl font-bold">{t(`${feature}.title`)}</h2>
        <p className="text-muted-foreground">{t(`${feature}.desc`)}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg">
          <Link href={checkoutUrl}>{t('upgradeCta')}</Link>
        </Button>
        <p className="text-xs text-muted-foreground">{t('trialNote')}</p>
      </div>
    </div>
  );
}
