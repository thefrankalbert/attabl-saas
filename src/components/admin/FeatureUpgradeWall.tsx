import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getAdminPermission } from '@/lib/auth/require-admin-permission';

type GatedFeature =
  | 'kds'
  | 'inventory'
  | 'recipes'
  | 'reports'
  | 'service'
  | 'tables'
  | 'venueReports'
  | 'advancedReports';

const FEATURE_EVENT_KEY: Record<GatedFeature, string> = {
  kds: 'kds_access_attempted',
  inventory: 'inventory_access_attempted',
  recipes: 'recipes_access_attempted',
  reports: 'reports_access_attempted',
  service: 'service_access_attempted',
  tables: 'tables_access_attempted',
  venueReports: 'venue_reports_access_attempted',
  advancedReports: 'advanced_reports_access_attempted',
};

// Plan minimal de chaque fonction: le libelle et le bouton le disent.
const BUSINESS_FEATURES: ReadonlySet<GatedFeature> = new Set(['venueReports', 'advancedReports']);

interface FeatureUpgradeWallProps {
  feature: GatedFeature;
  checkoutUrl: string;
  tenantId?: string;
  /**
   * Lien de retour, pour les pages plein ecran sans menu (ecran cuisine): sans
   * lui, le mur serait une impasse, la seule sortie etant "Passer au Pro".
   */
  backHref?: string;
}

export async function FeatureUpgradeWall({
  feature,
  checkoutUrl,
  tenantId,
  backHref,
}: FeatureUpgradeWallProps) {
  const t = await getTranslations('admin.upgradeWall');
  // Le bouton mene a /subscription (settings.view): le personnel ne peut pas
  // l'ouvrir. Il lit a la place qui peut activer la fonction. Le restaurant se
  // lit dans l'en-tete injecte par le middleware, l'URL ne sert que de repli.
  const site = /\/sites\/([^/]+)\//.exec(checkoutUrl)?.[1] ?? '';
  const canUpgrade = await getAdminPermission(site, 'settings.view');
  const isBusiness = BUSINESS_FEATURES.has(feature);

  if (tenantId) {
    const eventKey = FEATURE_EVENT_KEY[feature];
    try {
      const supabase = createAdminClient();
      // Atomic claim: merges into the live activation_events JSONB (|| server-side)
      // so other keys are preserved, and only sets the slot once. A raw .update()
      // here would overwrite the whole column and drop every other event key.
      await supabase.rpc('claim_activation_event', {
        p_tenant_id: tenantId,
        p_event_key: eventKey,
      });
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
          {t(isBusiness ? 'planRequiredBusiness' : 'planRequired')}
        </p>
        <h2 className="text-2xl font-bold">{t(`${feature}.title`)}</h2>
        <p className="text-muted-foreground">{t(`${feature}.desc`)}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        {canUpgrade ? (
          <Button asChild size="lg">
            <Link href={checkoutUrl}>{t(isBusiness ? 'upgradeCtaBusiness' : 'upgradeCta')}</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t('askOwner')}</p>
        )}
        {backHref && (
          <Button asChild variant="ghost" size="lg">
            <Link href={backHref}>{t('back')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
