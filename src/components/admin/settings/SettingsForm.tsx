'use client';

import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { actionUpdateTenantSettings } from '@/app/actions/tenant-settings';
import { SoundSettings } from './SoundSettings';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';
import { useSessionState } from '@/hooks/useSessionState';

// Feature components
import SettingsIdentity from '@/components/features/settings/SettingsIdentity';
import SettingsBranding from '@/components/features/settings/SettingsBranding';
import SettingsBilling from '@/components/features/settings/SettingsBilling';
import SettingsSecurity from '@/components/features/settings/SettingsSecurity';
import SettingsContact from '@/components/features/settings/SettingsContact';
import SettingsDomain from '@/components/features/settings/SettingsDomain';

// ─── Types ─────────────────────────────────────────────────

type SettingsTab =
  | 'identity'
  | 'branding'
  | 'billing'
  | 'sounds'
  | 'security'
  | 'contact'
  | 'domain'
  | 'language';

interface SettingsFormProps {
  tenant: SettingsTenant;
}

const TAB_CONFIG: { key: SettingsTab; labelKey: string }[] = [
  { key: 'identity', labelKey: 'tabIdentity' },
  { key: 'branding', labelKey: 'tabBranding' },
  { key: 'billing', labelKey: 'tabBilling' },
  { key: 'sounds', labelKey: 'tabSounds' },
  { key: 'security', labelKey: 'tabSecurity' },
  { key: 'contact', labelKey: 'tabContact' },
  { key: 'domain', labelKey: 'tabDomain' },
  { key: 'language', labelKey: 'tabLanguage' },
];

// ─── Main Component ────────────────────────────────────────

export function SettingsForm({ tenant }: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = useSessionState<SettingsTab>('settings:activeTab', 'identity');

  const {
    form,
    logoPreview,
    uploading,
    saving,
    selectedSoundId,
    setSelectedSoundId,
    handleLogoUpload,
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
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SettingsTab)}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="flex-shrink-0 h-auto w-full justify-start gap-0 overflow-x-auto scrollbar-hide rounded-none border-b border-app-border bg-transparent p-0">
            {TAB_CONFIG.map(({ key, labelKey }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="whitespace-nowrap rounded-none border-b-2 border-transparent px-3 sm:px-4 py-3 min-h-[44px] text-xs sm:text-sm font-medium text-app-text-secondary transition-colors hover:text-app-text data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-app-text data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                {t(labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
            {/* Identity tab */}
            <SettingsIdentity
              form={form}
              tenant={tenant}
              logoPreview={logoPreview}
              uploading={uploading}
              saving={saving}
              onLogoUpload={handleLogoUpload}
              t={t}
            />

            {/* Branding tab */}
            <SettingsBranding form={form} t={t} />

            {/* Billing tab */}
            <SettingsBilling form={form} t={t} />

            {/* Sounds tab */}
            <TabsContent value="sounds" className="mt-0">
              <SoundSettings
                currentSoundId={selectedSoundId}
                onSoundChange={setSelectedSoundId}
                tenantId={tenant.id}
              />
            </TabsContent>

            {/* Security tab */}
            <SettingsSecurity form={form} t={t} tenantSlug={tenant.slug} />

            {/* Contact tab */}
            <SettingsContact form={form} t={t} />

            {/* Domain tab */}
            <SettingsDomain
              currentDomain={tenant.custom_domain || null}
              tenantSlug={tenant.slug}
              onSave={async (domain) => {
                const formData = new FormData();
                // Pass required fields from current form values
                formData.append('name', form.getValues('name'));
                formData.append('primaryColor', form.getValues('primaryColor'));
                formData.append('secondaryColor', form.getValues('secondaryColor'));
                formData.append('customDomain', domain || '');
                const result = await actionUpdateTenantSettings(formData);
                if (!result.success) throw new Error(result.error);
              }}
            />

            {/* Language tab */}
            <TabsContent value="language" className="mt-0">
              <LocaleSwitcher />
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions - always visible */}
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
      </form>
    </RoleGuard>
  );
}
