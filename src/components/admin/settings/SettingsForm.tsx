'use client';

import { useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save, Store, LayoutGrid, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { SoundSettings } from './SoundSettings';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';
import { usePermissions } from '@/hooks/usePermissions';
import type { SettingsTab } from '@/lib/settings-tabs';

// Feature components
import SettingsIdentity from '@/components/features/settings/SettingsIdentity';
import SettingsBranding from '@/components/features/settings/SettingsBranding';
import SettingsBilling from '@/components/features/settings/SettingsBilling';
import SettingsSecurity from '@/components/features/settings/SettingsSecurity';
import SettingsContact from '@/components/features/settings/SettingsContact';
import SettingsOpeningHours from '@/components/features/settings/SettingsOpeningHours';
import { PushOptIn } from '@/components/admin/PushOptIn';

// --- Types -------------------------------------------------

interface SettingsFormProps {
  tenant: SettingsTenant;
  initialPaymentMethods: string[];
  initialTab: SettingsTab;
}

const TAB_CONFIG: { key: SettingsTab; labelKey: string }[] = [
  { key: 'identity', labelKey: 'tabIdentity' },
  { key: 'branding', labelKey: 'tabBranding' },
  { key: 'billing', labelKey: 'tabBilling' },
  { key: 'hours', labelKey: 'tabHours' },
  { key: 'sounds', labelKey: 'tabSounds' },
  { key: 'security', labelKey: 'tabSecurity' },
  { key: 'contact', labelKey: 'tabContact' },
];

// --- Main Component ----------------------------------------

export function SettingsForm({ tenant, initialPaymentMethods, initialTab }: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  // La page s'ouvre sur `settings.view` (admin-route-permissions.ts). Sans
  // `settings.edit`, elle reste lisible mais figee: les champs sont desactives
  // et ni l'enregistrement ni l'editeur de permissions ne s'affichent, au lieu
  // de "Acces refuse" ou d'un formulaire que le serveur refuserait ensuite.
  const { can, role } = usePermissions();
  const canEdit = can('settings.edit');
  // Owner decision (2026-11-09): only the owner edits permissions. An admin
  // holds settings.edit, so the link must not hang on it alone: it led him to
  // an "access denied" page.
  const canEditPermissions = role === 'owner';

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value !== 'identity') {
        params.set('tab', value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    [router, pathname],
  );

  const {
    form,
    logoPreview,
    uploading,
    saving,
    selectedSoundId,
    setSelectedSoundId,
    hasUnsavedChanges,
    handleLogoUpload,
    handleLogoChange,
    handleLogoRemove,
    onSubmit,
    onValidationError,
  } = useSettingsData(tenant);

  return (
    <RoleGuard permission="settings.view">
      <form
        onSubmit={form.handleSubmit(onSubmit, onValidationError)}
        className="flex flex-col h-full min-h-0"
      >
        <Card className="shrink-0 p-4 sm:p-5 mb-4 sm:mb-6">
          <p className="text-sm font-semibold text-app-text mb-3">{t('management.title')}</p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="min-h-[44px] justify-start sm:justify-center"
            >
              <Link href={`${pathname}/espaces`}>
                <Store className="mr-2 h-4 w-4" />
                {t('management.espaces')}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-[44px] justify-start sm:justify-center"
            >
              <Link href={`${pathname}/tables`}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                {t('management.tables')}
              </Link>
            </Button>
            {canEditPermissions && (
              <Button
                asChild
                variant="outline"
                className="min-h-[44px] justify-start sm:justify-center"
              >
                <Link href={`${pathname}/permissions`}>
                  <Users className="mr-2 h-4 w-4" />
                  {t('management.permissions')}
                </Link>
              </Button>
            )}
          </div>
        </Card>

        <Tabs
          value={initialTab}
          onValueChange={handleTabChange}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="flex-shrink-0 h-auto w-full justify-start gap-0 overflow-x-auto scrollbar-hide rounded-none border-b border-app-border bg-transparent p-0">
            {TAB_CONFIG.map(({ key, labelKey }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="whitespace-nowrap rounded-none border-b-2 border-transparent px-3 sm:px-4 md:px-6 lg:px-8 py-3 min-h-[44px] text-xs sm:text-sm font-medium text-app-text-secondary transition-colors hover:text-app-text data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-app-text data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                {t(labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6"
          >
            {/* display: contents - aucun effet de mise en page, seulement le
                verrou natif de tous les champs et boutons des onglets. */}
            <fieldset disabled={!canEdit} className="contents" data-testid="settings-fields">
              {/* Identity tab (includes domain + language) */}
              <SettingsIdentity
                form={form}
                tenant={tenant}
                logoPreview={logoPreview}
                uploading={uploading}
                saving={saving}
                onLogoUpload={handleLogoUpload}
                onLogoChange={handleLogoChange}
                onLogoRemove={handleLogoRemove}
                t={t}
              />

              {/* Branding tab */}
              <SettingsBranding form={form} t={t} />

              {/* Billing tab */}
              <SettingsBilling form={form} t={t} initialPaymentMethods={initialPaymentMethods} />

              {/* Opening hours tab */}
              <SettingsOpeningHours form={form} t={t} />

              {/* Sounds tab */}
              <TabsContent value="sounds" className="mt-0 space-y-6">
                <SoundSettings
                  currentSoundId={selectedSoundId}
                  onSoundChange={setSelectedSoundId}
                  tenantId={tenant.id}
                />
                <PushOptIn tenantId={tenant.id} />
              </TabsContent>

              {/* Security tab */}
              <SettingsSecurity form={form} t={t} tenantSlug={tenant.slug} />

              {/* Contact tab */}
              <SettingsContact form={form} t={t} />
            </fieldset>
          </div>
        </Tabs>

        {/* Actions - visible only when there are unsaved changes */}
        {canEdit && (hasUnsavedChanges || saving || uploading) && (
          <div className="shrink-0 flex justify-end gap-4 border-t border-app-border pt-4 mt-4">
            <Button
              type="submit"
              variant="default"
              disabled={saving || uploading}
              className="min-w-[120px] sm:min-w-[150px] min-h-[44px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tc('saving')}
                </>
              ) : uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('logoUploading')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {tc('saveChanges')}
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </RoleGuard>
  );
}
