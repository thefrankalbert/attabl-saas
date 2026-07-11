'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import {
  CircleUser,
  Store,
  Printer,
  Percent,
  Users,
  ExternalLink,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { getTenantUrl } from '@/lib/constants';

export type SettingsTab = 'compte' | 'etablissement' | 'imprimantes' | 'tva' | 'personnel';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  basePath: string;
  userName?: string;
  userEmail?: string;
  tenant: { name: string; slug: string; subscription_plan?: string };
  /** Mirrors the admin shell theme - the dialog portals outside .admin-shell */
  isDark?: boolean;
}

export function SettingsDialog({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  basePath,
  userName,
  userEmail,
  tenant,
  isDark = false,
}: SettingsDialogProps) {
  const t = useTranslations('admin');
  const clientUrl = getTenantUrl(tenant.slug);
  const planLabel = tenant.subscription_plan?.toUpperCase() || 'GRATUIT';

  const tabs: { key: SettingsTab; label: string; icon: typeof CircleUser }[] = [
    { key: 'compte', label: t('setAccount'), icon: CircleUser },
    { key: 'etablissement', label: t('setEstablishment'), icon: Store },
    { key: 'imprimantes', label: t('setPrinters'), icon: Printer },
    { key: 'tva', label: t('setTax'), icon: Percent },
    { key: 'personnel', label: t('setStaff'), icon: Users },
  ];

  const linkBtn = (href: string, label: string) => (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={href} onClick={() => onOpenChange(false)}>
        <ExternalLink className="size-3.5" />
        {label}
      </Link>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'admin-shell gap-0 overflow-hidden rounded-xl border-[var(--border)] bg-[var(--popover)] p-0 text-[var(--popover-foreground)] shadow-[0_24px_60px_rgb(0_0_0/0.4)] sm:max-w-[660px] [&>button]:hidden',
          isDark && 'dark',
        )}
      >
        <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-[var(--border)] px-5 py-4">
          <Settings className="size-4 text-[var(--foreground)]" />
          <DialogTitle className="text-[15px] font-semibold">{t('settingsHub')}</DialogTitle>
          <DialogDescription className="sr-only">{t('setAccountSub')}</DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer"
            className="ml-auto size-[30px] rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>

        <div className="flex min-h-[400px] flex-col sm:h-[460px] sm:flex-row">
          {/* Vertical tabs */}
          <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[var(--border)] p-2 sm:w-[180px] sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {tabs.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                onClick={() => onTabChange(key)}
                className={cn(
                  'h-auto justify-start gap-[9px] px-2.5 py-2 text-[13px] font-normal',
                  activeTab === key
                    ? 'bg-[var(--accent)] font-medium text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon className="size-[15px] shrink-0" />
                {label}
              </Button>
            ))}
          </nav>

          {/* Panes */}
          <div className="min-w-0 flex-1 space-y-4 p-[22px]">
            {activeTab === 'compte' && (
              <Pane title={t('setAccount')} sub={t('setAccountSub')}>
                <Field label={t('setFieldName')} value={userName || '-'} />
                <Field label={t('setFieldEmail')} value={userEmail || '-'} />
                <Field label={t('setFieldPlan')} value={planLabel} />
                <div>{linkBtn(`${basePath}/subscription`, t('setManageSub'))}</div>
              </Pane>
            )}

            {activeTab === 'etablissement' && (
              <Pane title={t('setEstablishment')} sub={t('setEstablishmentSub')}>
                <Field label={t('setFieldVenue')} value={tenant.name} />
                <div className="space-y-2">
                  <Label className="text-[13px] text-[var(--muted-foreground)]">
                    {t('setFieldQr')}
                  </Label>
                  <div className="flex items-center gap-4">
                    <div className="grid size-[104px] place-items-center rounded-[10px] border border-[var(--border)] bg-white p-2">
                      <QRCodeSVG value={clientUrl} size={80} bgColor="#ffffff" fgColor="#000000" />
                    </div>
                    {linkBtn(`${basePath}/qr-codes`, t('setManageQr'))}
                  </div>
                </div>
              </Pane>
            )}

            {activeTab === 'imprimantes' && (
              <Pane title={t('setPrinters')} sub={t('setPrintersSub')}>
                <div>{linkBtn(`${basePath}/settings`, t('setManageSettings'))}</div>
              </Pane>
            )}

            {activeTab === 'tva' && (
              <Pane title={t('setTax')} sub={t('setTaxSub')}>
                <div>{linkBtn(`${basePath}/settings`, t('setManageSettings'))}</div>
              </Pane>
            )}

            {activeTab === 'personnel' && (
              <Pane title={t('setStaff')} sub={t('setStaffSub')}>
                <div>{linkBtn(`${basePath}/users`, t('setManageStaff'))}</div>
              </Pane>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pane({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-[13px] text-[var(--muted-foreground)]">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</Label>
      <Input
        value={value}
        readOnly
        className={cn('h-[34px] text-[16px] md:text-[13px]', mono && 'font-mono')}
      />
    </div>
  );
}
