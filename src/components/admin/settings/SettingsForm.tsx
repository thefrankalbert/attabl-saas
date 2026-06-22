'use client';

import { useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { actionUpdateTenantSettings } from '@/app/actions/tenant-settings';
import { SoundSettings } from './SoundSettings';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';
import type { SettingsTab } from '@/lib/settings-tabs';

// Feature components
import SettingsIdentity from '@/components/features/settings/SettingsIdentity';
import SettingsBranding from '@/components/features/settings/SettingsBranding';
import SettingsBilling from '@/components/features/settings/SettingsBilling';
import SettingsSecurity from '@/components/features/settings/SettingsSecurity';
import SettingsContact from '@/components/features/settings/SettingsContact';
import SettingsOpeningHours from '@/components/features/settings/SettingsOpeningHours';
import { PushOptIn } from '@/components/admin/PushOptIn';

// ─── Types ─────────────────────────────────────────────────

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

// ─── Main Component ────────────────────────────────────────

export function SettingsForm({ tenant, initialPaymentMethods, initialTab }: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <RoleGuard permission="canManageSettings">
      <form
        onSubmit={form.handleSubmit(onSubmit, onValidationError)}
        className="flex flex-col h-full min-h-0"
      >
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
                className="whitespace-nowrap rounded-none border-b-2 border-transparent px-3 @sm:px-4 @lg:px-6 @xl:px-8 py-3 min-h-[44px] text-xs @sm:text-sm font-medium text-app-text-secondary transition-colors hover:text-app-text data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-app-text data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                {t(labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 @sm:mt-6"
          >
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
              onDomainSave={async (domain) => {
                // Partial save: only the domain. The action/service skip every
                // field absent from the FormData, so this never writes the
                // (possibly unsaved/invalid) name or colors from the main form.
                const formData = new FormData();
                formData.append('customDomain', domain || '');
                const result = await actionUpdateTenantSettings(formData);
                if (!result.success) throw new Error(result.error);
              }}
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
          </div>
        </Tabs>

        {/* Actions - visible only when there are unsaved changes */}
        {(hasUnsavedChanges || saving || uploading) && (
          <div className="shrink-0 flex justify-end gap-4 border-t border-app-border pt-4 mt-4">
            <Button
              type="submit"
              variant="default"
              disabled={saving || uploading}
              className="min-w-[120px] @sm:min-w-[150px] min-h-[44px]"
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
