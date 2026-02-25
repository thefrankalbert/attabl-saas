'use client';

import { Loader2, Save, Store, Palette, MapPin, Bell, Receipt, Globe, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
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

// ─── Types ─────────────────────────────────────────────────

type SettingsTab =
  | 'identity'
  | 'branding'
  | 'billing'
  | 'sounds'
  | 'security'
  | 'contact'
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
  } = useSettingsData(tenant);

  return (
    <RoleGuard permission="canManageSettings">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="max-w-4xl flex flex-col h-full min-h-0"
      >
        <Tabs defaultValue="identity" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-shrink-0 h-auto w-full justify-start gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide rounded-none border-b border-neutral-200 bg-transparent p-0">
            {TAB_CONFIG.map(({ key, icon: Icon, labelKey }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 sm:px-4 py-3 min-h-[44px] text-xs sm:text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700 data-[state=active]:border-[#CCFF00] data-[state=active]:bg-transparent data-[state=active]:text-neutral-900 data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 mt-4 sm:mt-6">
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
              <div className="bg-white rounded-xl border border-neutral-100 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Bell className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {t('notificationSounds')}
                    </h2>
                    <p className="text-sm text-neutral-500">{t('soundPlayedOnOrderReceived')}</p>
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

            {/* Language tab */}
            <TabsContent value="language" className="mt-0">
              <div className="bg-white rounded-xl border border-neutral-100 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {t('languageSection')}
                    </h2>
                    <p className="text-sm text-neutral-500">{t('languageDescription')}</p>
                  </div>
                </div>

                <LocaleSwitcher />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions - always visible */}
        <div className="flex-shrink-0 flex justify-end gap-4 border-t border-neutral-100 pt-4 mt-4 px-0 sm:px-0">
          <Button
            type="submit"
            variant="lime"
            disabled={saving || uploading}
            className="min-w-[120px] sm:min-w-[150px] min-h-[44px]"
          >
            {saving || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tc('saving')}
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
