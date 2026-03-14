'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, Clock, Globe, Mail } from 'lucide-react';
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
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { locales, LOCALE_LABELS } from '@/i18n/config';
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
  onLogoUpload,
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

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  return (
    <TabsContent value="identity" className="mt-0">
      <div className="space-y-6">
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('restaurantName')}</Label>
              <Input id="name" {...register('name')} className="min-h-[44px]" />
              {errors.name && <p className="text-xs text-status-error">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('shortDescription')}</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder={t('descriptionPlaceholder')}
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
            <div className="flex flex-col @sm:flex-row items-start @sm:items-center gap-4 sm:gap-6">
              <div className="relative w-32 h-32 rounded-xl bg-app-elevated border-2 border-dashed border-app-border flex items-center justify-center overflow-hidden group hover:border-app-text-muted transition-colors">
                {logoPreview ? (
                  <Image src={logoPreview} alt="Logo preview" fill className="object-contain p-2" />
                ) : (
                  <Upload className="h-8 w-8 text-app-text-muted" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onLogoUpload}
                  disabled={uploading || saving}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                {uploading ? (
                  <div className="absolute inset-0 bg-app-text/50 flex flex-col items-center justify-center">
                    <Loader2 className="h-6 w-6 text-accent-text animate-spin" />
                    <p className="text-accent-text text-xs font-medium mt-1">
                      {t('logoUploading')}
                    </p>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-app-text/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-accent-text text-xs font-medium">{t('modify')}</p>
                  </div>
                )}
              </div>
              <div className="text-sm text-app-text-secondary">
                <p>{t('recommendedFormat')}</p>
                <p>{t('maxSize')}</p>
                <p>{t('ratio')}</p>
              </div>
            </div>
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
            <Label className="text-sm font-semibold text-app-text">{t('customDomain')}</Label>
            <p className="text-xs text-app-text-secondary mt-0.5">{t('customDomainDesc')}</p>
          </div>

          <div className="flex gap-2">
            <Input
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setVerified(false);
              }}
              placeholder={t('customDomainPlaceholder')}
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
            <p className="font-medium text-app-text mb-1">{t('dnsConfig')}</p>
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
          <Label className="text-sm font-semibold text-app-text">{t('languageSection')}</Label>
          <p className="text-xs text-app-text-secondary">{t('languageDescription')}</p>
          <div className="relative flex items-center max-w-xs">
            <Globe className="absolute left-2.5 h-3.5 w-3.5 text-app-text-muted pointer-events-none" />
            <select
              value={locale}
              onChange={handleLocaleChange}
              className="w-full h-10 min-h-[44px] pl-8 pr-3 text-sm bg-app-elevated border border-app-border text-app-text hover:bg-app-hover rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20 transition-colors"
            >
              {locales.map((loc) => {
                const info = LOCALE_LABELS[loc];
                return (
                  <option key={loc} value={loc}>
                    {info.label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
