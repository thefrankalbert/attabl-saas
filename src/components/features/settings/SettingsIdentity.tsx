'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, Clock, Globe, Mail } from 'lucide-react';
import ImageUpload from '@/components/shared/ImageUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { locales, LOCALE_LABELS } from '@/i18n/config';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

const ESTABLISHMENT_TYPES = [
  { value: 'restaurant', labelKey: 'typeRestaurant' },
  { value: 'hotel', labelKey: 'typeHotel' },
  { value: 'bar', labelKey: 'typeBar' },
  { value: 'cafe', labelKey: 'typeCafe' },
  { value: 'fastfood', labelKey: 'typeFastfood' },
  { value: 'retail', labelKey: 'typeRetail' },
  { value: 'boutique', labelKey: 'typeBoutique' },
  { value: 'pharmacy', labelKey: 'typePharmacy' },
  { value: 'salon', labelKey: 'typeSalon' },
  { value: 'other', labelKey: 'typeOther' },
] as const;

// ─── Types ─────────────────────────────────────────────────

interface SettingsIdentityProps {
  form: UseFormReturn<SettingsFormValues>;
  tenant: { slug: string; custom_domain?: string | null };
  logoPreview: string | null;
  uploading: boolean;
  saving: boolean;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onLogoChange?: (url: string) => void;
  onLogoRemove?: () => void;
  onDomainSave: (domain: string | null) => Promise<void>;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsIdentity({
  form,
  tenant,
  logoPreview,
  uploading,
  saving,
  onLogoChange,
  onLogoRemove,
  onDomainSave,
  t,
}: SettingsIdentityProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const watchedEstablishmentType = watch('establishmentType');
  const { toast } = useToast();
  const locale = useLocale();
  const router = useRouter();
  const seg = useSegmentTerms();

  // Domain state
  const [domain, setDomain] = useState(tenant.custom_domain || '');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(!!tenant.custom_domain);
  const [domainSaving, setDomainSaving] = useState(false);

  const handleVerifyDomain = async () => {
    if (!domain.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/domain-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenant.slug },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      setVerified(data.verified);
      if (!data.verified) {
        toast({ title: t('domainPending'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('domainPending'), variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveDomain = async () => {
    setDomainSaving(true);
    try {
      await onDomainSave(domain.trim() || null);
      toast({ title: t('domainSaved') });
    } catch {
      toast({ title: t('settingsSaveError'), variant: 'destructive' });
    } finally {
      setDomainSaving(false);
    }
  };

  const handleRemoveDomain = async () => {
    setDomainSaving(true);
    try {
      await onDomainSave(null);
      setDomain('');
      setVerified(false);
      toast({ title: t('domainRemoved') });
    } catch {
      toast({ title: t('settingsSaveError'), variant: 'destructive' });
    } finally {
      setDomainSaving(false);
    }
  };

  const handleLocaleChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  return (
    <TabsContent value="identity" className="mt-0">
      <div className="space-y-6">
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{seg.identityLabel}</Label>
              <Input id="name" {...register('name')} className="min-h-[44px]" />
              {errors.name && <p className="text-xs text-status-error">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('shortDescription')}</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder={seg.descPlaceholder}
                className="resize-none h-24 min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('establishmentType') ?? "Type d'etablissement"}</Label>
              <Select
                value={watchedEstablishmentType || 'restaurant'}
                onValueChange={(val) => setValue('establishmentType', val, { shouldDirty: true })}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTABLISHMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(type.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <Label>{t('logo')}</Label>
            <div className="max-w-sm">
              <ImageUpload
                value={logoPreview || ''}
                onChange={(url) => onLogoChange?.(url)}
                onRemove={() => onLogoRemove?.()}
                disabled={uploading || saving}
                bucket="tenant-logos"
                aspect={1}
                maxWidth={512}
              />
            </div>
            <p className="text-xs text-app-text-muted">
              {t('recommendedFormat')} - {t('maxSize')}
            </p>
          </div>
        </div>

        <hr className="border-app-border" />

        {/* Slug (read-only display) */}
        <div className="space-y-2">
          <Label htmlFor="slug">{t('slug') ?? 'Slug'}</Label>
          <div className="flex flex-col @sm:flex-row @sm:items-center gap-2">
            <span className="text-sm text-app-text-muted">https://</span>
            <Input
              id="slug"
              value={tenant.slug}
              disabled
              className="max-w-xs font-mono text-app-text-secondary min-h-[44px]"
            />
            <span className="text-sm text-app-text-muted">.attabl.com</span>
          </div>
          <p className="text-xs text-app-text-secondary">
            {t('slugDescription') ?? 'Your unique subdomain. Contact support to change it.'}{' '}
            <a
              href="mailto:support@attabl.com"
              className="text-accent hover:underline inline-flex items-center gap-1"
            >
              <Mail className="w-3 h-3" />
              support@attabl.com
            </a>
          </p>
        </div>

        <hr className="border-app-border" />

        {/* Domain section (moved from separate tab) */}
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-bold text-app-text">{t('customDomain')}</Label>
            <p className="text-xs text-app-text-secondary mt-0.5">{t('customDomainDesc')}</p>
          </div>

          <div className="flex gap-2">
            <Input
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setVerified(false);
              }}
              placeholder={seg.domainPlaceholder}
              className="flex-1 min-h-[44px]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleVerifyDomain}
              disabled={verifying || !domain.trim()}
              className="min-h-[44px]"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('verifyDomain')}
            </Button>
          </div>

          {domain.trim() && (
            <div className="flex items-center gap-2 text-xs">
              {verified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600">{t('domainVerified')}</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-600">{t('domainPending')}</span>
                </>
              )}
            </div>
          )}

          <div className="rounded-lg border border-app-border p-3 text-xs text-app-text-secondary">
            <p className="font-normal text-app-text mb-1">{t('dnsConfig')}</p>
            <p>{t('domainInstructions')}</p>
            <code className="block mt-2 bg-app-elevated p-2 rounded text-xs font-mono">
              CNAME &rarr; cname.vercel-dns.com
            </code>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="default"
              onClick={handleSaveDomain}
              disabled={domainSaving || !domain.trim()}
              className="min-h-[44px]"
            >
              {domainSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save')}
            </Button>
            {tenant.custom_domain && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoveDomain}
                disabled={domainSaving}
                className="text-red-600 min-h-[44px]"
              >
                {t('remove')}
              </Button>
            )}
          </div>

          <p className="text-xs text-app-text-muted">
            {t('currentUrl')}{' '}
            <code className="bg-app-elevated px-1 rounded">{tenant.slug}.attabl.com</code>
          </p>
        </div>

        <hr className="border-app-border" />

        {/* Language section (moved from separate tab) */}
        <div className="space-y-2">
          <Label className="text-sm font-bold text-app-text">{t('languageSection')}</Label>
          <p className="text-xs text-app-text-secondary">{t('languageDescription')}</p>
          <div className="relative flex items-center max-w-xs">
            <Globe className="absolute left-2.5 h-3.5 w-3.5 text-app-text-muted pointer-events-none z-10" />
            <Select value={locale} onValueChange={handleLocaleChange}>
              <SelectTrigger className="w-full h-10 min-h-[44px] pl-8 pr-3 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((loc) => {
                  const info = LOCALE_LABELS[loc];
                  return (
                    <SelectItem key={loc} value={loc}>
                      {info.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
