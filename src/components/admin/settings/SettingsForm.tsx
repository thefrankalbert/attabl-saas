'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save, Store, LayoutGrid, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsData } from '@/hooks/useSettingsData';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { SoundSettings } from './SoundSettings';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { parseSettingsTab, type SettingsTab } from '@/lib/settings-tabs';

// Feature components
import SettingsIdentity from '@/components/features/settings/SettingsIdentity';
import SettingsBranding from '@/components/features/settings/SettingsBranding';
import SettingsBilling from '@/components/features/settings/SettingsBilling';
import SettingsSecurity from '@/components/features/settings/SettingsSecurity';
import SettingsContact from '@/components/features/settings/SettingsContact';
import SettingsOpeningHours from '@/components/features/settings/SettingsOpeningHours';
import { PushOptIn } from '@/components/admin/PushOptIn';
import { ReminderSettingsPanel } from './ReminderSettingsPanel';
import type { ReminderSettings } from '@/lib/validations/reminders.schema';

// --- Types -------------------------------------------------

interface SettingsFormProps {
  tenant: SettingsTenant;
  initialPaymentMethods: string[];
  initialTab: SettingsTab;
  initialReminderSettings: ReminderSettings;
}

const MANAGEMENT_BTN_CLS =
  'h-auto min-h-[44px] flex-col gap-1 px-2 py-2 text-xs whitespace-normal text-center sm:flex-row sm:gap-0 sm:px-4 sm:text-sm';

const TAB_CONFIG: { key: SettingsTab; labelKey: string }[] = [
  { key: 'identity', labelKey: 'tabIdentity' },
  { key: 'branding', labelKey: 'tabBranding' },
  { key: 'billing', labelKey: 'tabBilling' },
  { key: 'hours', labelKey: 'tabHours' },
  { key: 'sounds', labelKey: 'tabSounds' },
  { key: 'security', labelKey: 'tabSecurity' },
  { key: 'contact', labelKey: 'tabContact' },
  { key: 'reminders', labelKey: 'tabReminders' },
];

// --- Main Component ----------------------------------------

export function SettingsForm({
  tenant,
  initialPaymentMethods,
  initialTab,
  initialReminderSettings,
}: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The active tab lives in the URL (?tab=), read on the client so a tab click
  // never waits for the server.
  const activeTab = searchParams
    ? parseSettingsTab(searchParams.get('tab') ?? undefined)
    : initialTab;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Telephone: la bande d'onglets defile de cote. Ouverte sur ?tab=contact (ou
  // sons, securite...), elle laissait l'onglet actif hors cadre: on le centre.
  const tabsListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = tabsListRef.current;
    const active = list?.querySelector<HTMLElement>('[data-state="active"]');
    if (!list || !active) return;
    // offsetLeft se mesure depuis l'ancetre positionne, pas depuis la liste.
    list.scrollLeft =
      active.offsetLeft - list.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
  }, [activeTab]);
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
      // Every tab is already rendered on the page: update the URL without a
      // navigation. router.push re-fetched the whole settings page from the
      // server on every tab click (seconds on a weak mobile network). The App
      // Router keeps useSearchParams in sync with history.pushState, and Back
      // still steps through the tabs.
      window.history.pushState(null, '', qs ? `${pathname}?${qs}` : pathname);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    [pathname],
  );

  const {
    form,
    logoPreview,
    saving,
    selectedSoundId,
    setSelectedSoundId,
    hasUnsavedChanges,
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
        {/* Phone: the three links share one row so this pinned block stays short and
            leaves the screen to the form; from sm they are regular buttons. */}
        <Card className="shrink-0 p-3 sm:p-5 mb-3 sm:mb-6">
          <p className="text-sm font-semibold text-app-text mb-2 sm:mb-3">
            {t('management.title')}
          </p>
          <div
            className={cn(
              'grid gap-2 sm:flex sm:flex-row sm:flex-wrap',
              canEditPermissions ? 'grid-cols-3' : 'grid-cols-2',
            )}
          >
            <Button asChild variant="outline" className={MANAGEMENT_BTN_CLS}>
              <Link href={`${pathname}/espaces`}>
                <Store className="h-4 w-4 shrink-0 sm:mr-2" />
                {t('management.espaces')}
              </Link>
            </Button>
            <Button asChild variant="outline" className={MANAGEMENT_BTN_CLS}>
              <Link href={`${pathname}/tables`}>
                <LayoutGrid className="h-4 w-4 shrink-0 sm:mr-2" />
                {t('management.tables')}
              </Link>
            </Button>
            {canEditPermissions && (
              <Button asChild variant="outline" className={MANAGEMENT_BTN_CLS}>
                <Link href={`${pathname}/permissions`}>
                  <Users className="h-4 w-4 shrink-0 sm:mr-2" />
                  {t('management.permissions')}
                </Link>
              </Button>
            )}
          </div>
        </Card>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex flex-col flex-1 min-h-0"
        >
          {/* Phone: the tabs scroll sideways; the right edge fades out so the hidden
              ones (Sons, Securite, Contact) read as "more to swipe". */}
          <TabsList
            ref={tabsListRef}
            className="flex-shrink-0 h-auto w-full justify-start gap-0 overflow-x-auto scrollbar-hide rounded-none border-b border-app-border bg-transparent p-0 [mask-image:linear-gradient(to_right,black_80%,transparent)] md:[mask-image:none]"
          >
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
                saving={saving}
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

              {/* Reminders tab: its own save (the reminders live outside this form). */}
              <ReminderSettingsPanel
                initial={initialReminderSettings}
                hasOpeningHours={Object.keys(tenant.opening_hours ?? {}).length > 0}
                canEdit={canEdit}
              />
            </fieldset>
          </div>
        </Tabs>

        {/* Actions - visible only when there are unsaved changes */}
        {canEdit && (hasUnsavedChanges || saving) && (
          <div className="shrink-0 flex justify-end gap-4 border-t border-app-border pt-4 mt-4">
            <Button
              type="submit"
              variant="default"
              disabled={saving}
              className="min-w-[120px] sm:min-w-[150px] min-h-[44px]"
            >
              {saving ? (
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
        )}
      </form>
    </RoleGuard>
  );
}
