'use client';

import {
  Loader2,
  Save,
  Store,
  Palette,
  MapPin,
  Bell,
  Receipt,
  Globe,
  Shield,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { updateTenantSettings } from '@/app/actions/tenant-settings';
import { SoundSettings } from './SoundSettings';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';

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

const TAB_CONFIG: { key: SettingsTab; icon: React.ElementType; labelKey: string }[] = [
  { key: 'identity', icon: Store, labelKey: 'tabIdentity' },
  { key: 'branding', icon: Palette, labelKey: 'tabBranding' },
  { key: 'billing', icon: Receipt, labelKey: 'tabBilling' },
  { key: 'sounds', icon: Bell, labelKey: 'tabSounds' },
  { key: 'security', icon: Shield, labelKey: 'tabSecurity' },
  { key: 'contact', icon: MapPin, labelKey: 'tabContact' },
  { key: 'domain', icon: Link2, labelKey: 'tabDomain' },
  { key: 'language', icon: Globe, labelKey: 'tabLanguage' },
];

// ─── Main Component ────────────────────────────────────────

export function SettingsForm({ tenant }: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');

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
        className="max-w-4xl xl:max-w-5xl flex flex-col h-full min-h-0"
      >
        <Tabs defaultValue="identity" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-shrink-0 h-auto w-full justify-start gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide rounded-none border-b border-app-border bg-transparent p-0">
            {TAB_CONFIG.map(({ key, icon: Icon, labelKey }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 sm:px-4 py-3 min-h-[44px] text-xs sm:text-sm font-medium text-app-text-secondary transition-colors hover:text-app-text data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-app-text data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto mt-4 sm:mt-6">
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
              <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Bell className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-app-text">
                      {t('notificationSounds')}
                    </h2>
                    <p className="text-xs text-app-text-secondary">
                      {t('soundPlayedOnOrderReceived')}
                    </p>
                  </div>
                </div>

                <SoundSettings
                  currentSoundId={selectedSoundId}
                  onSoundChange={setSelectedSoundId}
                  tenantId={tenant.id}
                />
              </div>
            </TabsContent>

            {/* Security tab */}
            <SettingsSecurity form={form} t={t} />

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
                const result = await updateTenantSettings(formData);
                if (!result.success) throw new Error(result.error);
              }}
            />

            {/* Language tab */}
            <TabsContent value="language" className="mt-0">
              <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-app-text">{t('languageSection')}</h2>
                    <p className="text-sm text-app-text-secondary">{t('languageDescription')}</p>
                  </div>
                </div>

                <LocaleSwitcher />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions - always visible */}
        <div className="flex-shrink-0 flex justify-end gap-4 border-t border-app-border pt-4 mt-4 px-0 sm:px-0">
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
