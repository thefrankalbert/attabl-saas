'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Upload,
  Loader2,
  Save,
  Store,
  Palette,
  MapPin,
  Bell,
  Receipt,
  Clock,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { updateTenantSettings } from '@/app/actions/tenant-settings';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { SoundSettings } from './SoundSettings';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import type { CurrencyCode } from '@/types/admin.types';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';

function createSettingsSchema(messages: { nameMinLength: string; invalidColor: string }) {
  return z.object({
    name: z.string().min(2, messages.nameMinLength),
    description: z.string().optional(),
    primaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, messages.invalidColor),
    secondaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, messages.invalidColor),
    address: z.string().optional(),
    phone: z.string().optional(),
    // Facturation fields
    currency: z.enum(['XAF', 'EUR', 'USD']).optional(),
    enableTax: z.boolean().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    enableServiceCharge: z.boolean().optional(),
    serviceChargeRate: z.number().min(0).max(100).optional(),
    // Idle timeout
    idleTimeoutMinutes: z.number().int().min(5).max(120).nullable().optional(),
    screenLockMode: z.enum(['overlay', 'password']).optional(),
  });
}

type SettingsFormValues = z.infer<ReturnType<typeof createSettingsSchema>>;

interface SettingsFormProps {
  tenant: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    address?: string;
    phone?: string;
    notification_sound_id?: string;
    currency?: CurrencyCode;
    enable_tax?: boolean;
    tax_rate?: number;
    enable_service_charge?: boolean;
    service_charge_rate?: number;
    idle_timeout_minutes?: number | null;
    screen_lock_mode?: 'overlay' | 'password';
  };
}

export function SettingsForm({ tenant }: SettingsFormProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const settingsSchema = createSettingsSchema({
    nameMinLength: t('nameMinLength'),
    invalidColor: t('invalidColor'),
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSoundId, setSelectedSoundId] = useState(
    tenant.notification_sound_id || 'classic-bell',
  );
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: tenant.name,
      description: tenant.description || '',
      primaryColor: tenant.primary_color || '#000000',
      secondaryColor: tenant.secondary_color || '#FFFFFF',
      address: tenant.address || '',
      phone: tenant.phone || '',
      currency: tenant.currency || 'XAF',
      enableTax: tenant.enable_tax ?? false,
      taxRate: tenant.tax_rate ?? 0,
      enableServiceCharge: tenant.enable_service_charge ?? false,
      serviceChargeRate: tenant.service_charge_rate ?? 0,
      idleTimeoutMinutes: tenant.idle_timeout_minutes ?? 30,
      screenLockMode: tenant.screen_lock_mode ?? 'overlay',
    },
  });

  const watchedPrimaryColor = watch('primaryColor');
  const watchEnableTax = watch('enableTax');
  const watchEnableServiceCharge = watch('enableServiceCharge');
  const watchIdleTimeoutMinutes = watch('idleTimeoutMinutes');
  const watchScreenLockMode = watch('screenLockMode');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: t('fileTooLarge'),
          description: t('logoMaxSize'),
          variant: 'destructive',
        });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: SettingsFormValues) => {
    setSaving(true);
    try {
      let finalLogoUrl = tenant.logo_url || '';

      // Upload logo if changed
      if (logoFile) {
        setUploading(true);
        try {
          const supabase = createClient();
          const fileExt = logoFile.name.split('.').pop() || 'png';
          const fileName = `${tenant.slug}/logo-${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, logoFile, { upsert: true });

          if (uploadError) {
            throw uploadError;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from('images').getPublicUrl(fileName);
          finalLogoUrl = publicUrl;
        } catch (uploadErr) {
          logger.error('Failed to upload logo to storage', uploadErr);
          // Revert logo preview to original on failure
          setLogoPreview(tenant.logo_url || null);
          setLogoFile(null);
          toast({
            title: tc('error'),
            description: t('logoUploadError'),
            variant: 'destructive',
          });
          return;
        } finally {
          setUploading(false);
        }
      }

      // Prepare form data for server action
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description || '');
      formData.append('primaryColor', data.primaryColor);
      formData.append('secondaryColor', data.secondaryColor);
      formData.append('address', data.address || '');
      formData.append('phone', data.phone || '');
      if (finalLogoUrl) formData.append('logoUrl', finalLogoUrl);
      formData.append('notificationSoundId', selectedSoundId);
      // Facturation fields
      formData.append('currency', data.currency || 'XAF');
      formData.append('enableTax', data.enableTax ? 'true' : 'false');
      formData.append('taxRate', String(data.taxRate ?? 0));
      formData.append('enableServiceCharge', data.enableServiceCharge ? 'true' : 'false');
      formData.append('serviceChargeRate', String(data.serviceChargeRate ?? 0));
      // Idle timeout
      if (data.idleTimeoutMinutes !== null && data.idleTimeoutMinutes !== undefined) {
        formData.append('idleTimeoutMinutes', String(data.idleTimeoutMinutes));
      }
      formData.append('screenLockMode', data.screenLockMode || 'overlay');

      const result = await updateTenantSettings(formData);

      if (result.success) {
        // Clear the file reference after successful save
        setLogoFile(null);
        toast({
          title: t('settingsUpdated'),
          description: t('settingsSavedSuccess'),
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error('Failed to save settings', error);
      toast({
        title: tc('error'),
        description: t('settingsSaveError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Identite */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('restaurantIdentity')}</h2>
              <p className="text-sm text-neutral-500">{t('clientVisibleInfo')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('restaurantName')}</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('shortDescription')}</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder={t('descriptionPlaceholder')}
                  className="resize-none h-24"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>{t('logo')}</Label>
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32 rounded-xl bg-neutral-50 border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden group hover:border-neutral-300 transition-colors">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-2"
                    />
                  ) : (
                    <Upload className="h-8 w-8 text-neutral-300" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploading || saving}
                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  {uploading ? (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                      <p className="text-white text-xs font-medium mt-1">{t('logoUploading')}</p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-medium">{t('modify')}</p>
                    </div>
                  )}
                </div>
                <div className="text-sm text-neutral-500">
                  <p>{t('recommendedFormat')}</p>
                  <p>{t('maxSize')}</p>
                  <p>{t('ratio')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Palette className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('customization')}</h2>
              <p className="text-sm text-neutral-500">{t('digitalMenuColors')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">{t('primaryColor')}</Label>
                <div className="flex gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-neutral-200"
                    style={{ backgroundColor: watchedPrimaryColor }}
                  />
                  <Input id="primaryColor" {...register('primaryColor')} className="font-mono" />
                </div>
                <p className="text-xs text-neutral-500">{t('usedForButtonsAndTitles')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryColor">{t('secondaryColor')}</Label>
                <div className="flex gap-3">
                  <Input
                    id="secondaryColor"
                    type="color"
                    className="w-10 h-10 p-1 rounded-lg cursor-pointer"
                    {...register('secondaryColor')}
                  />
                  <Input {...register('secondaryColor')} className="font-mono flex-1" />
                </div>
                <p className="text-xs text-neutral-500">{t('usedForTextOnColoredBg')}</p>
              </div>
            </div>

            {/* Preview Card */}
            <div className="p-4 rounded-xl border border-neutral-100 bg-neutral-50">
              <h3 className="text-xs font-semibold text-neutral-500 mb-3 uppercase tracking-wider">
                {t('buttonPreview')}
              </h3>
              <div className="flex items-center justify-center h-24 bg-white rounded-lg border border-neutral-200">
                <button
                  type="button"
                  className="px-6 py-2.5 rounded-lg font-medium transition-transform active:scale-95"
                  style={{
                    backgroundColor: watchedPrimaryColor,
                    color: watch('secondaryColor'),
                  }}
                >
                  {t('orderButtonPreview')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Facturation */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Receipt className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('billing')}</h2>
              <p className="text-sm text-neutral-500">{t('currencyTaxesAndFees')}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Currency Selector */}
            <div className="space-y-2">
              <Label htmlFor="currency">{t('currency')}</Label>
              <select
                id="currency"
                {...register('currency')}
                className="flex h-10 w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="XAF">Franc CFA (XAF)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="USD">Dollar US (USD)</option>
              </select>
              <p className="text-xs text-neutral-500">{t('currencyUsedForPriceDisplay')}</p>
            </div>

            {/* Tax Toggle + Rate */}
            <div className="space-y-3 p-4 rounded-lg border border-neutral-100 bg-neutral-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enableTax" className="text-sm font-medium text-neutral-900">
                    {t('enableVat')}
                  </Label>
                  <p className="text-xs text-neutral-500 mt-0.5">{t('applyTaxOnOrders')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="enableTax"
                    {...register('enableTax')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {watchEnableTax && (
                <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-2">
                  <Label htmlFor="taxRate" className="text-sm text-neutral-600 whitespace-nowrap">
                    {t('vatRate')}
                  </Label>
                  <div className="relative w-32">
                    <Input
                      id="taxRate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      {...register('taxRate', { valueAsNumber: true })}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                      %
                    </span>
                  </div>
                  {errors.taxRate && (
                    <p className="text-xs text-red-500">{errors.taxRate.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Service Charge Toggle + Rate */}
            <div className="space-y-3 p-4 rounded-lg border border-neutral-100 bg-neutral-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="enableServiceCharge"
                    className="text-sm font-medium text-neutral-900"
                  >
                    {t('enableServiceFee')}
                  </Label>
                  <p className="text-xs text-neutral-500 mt-0.5">{t('addServiceFeeToOrders')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="enableServiceCharge"
                    {...register('enableServiceCharge')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {watchEnableServiceCharge && (
                <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-2">
                  <Label
                    htmlFor="serviceChargeRate"
                    className="text-sm text-neutral-600 whitespace-nowrap"
                  >
                    {t('serviceFeeRate')}
                  </Label>
                  <div className="relative w-32">
                    <Input
                      id="serviceChargeRate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      {...register('serviceChargeRate', { valueAsNumber: true })}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                      %
                    </span>
                  </div>
                  {errors.serviceChargeRate && (
                    <p className="text-xs text-red-500">{errors.serviceChargeRate.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notification Sounds */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('notificationSounds')}</h2>
              <p className="text-sm text-neutral-500">{t('soundPlayedOnOrderReceived')}</p>
            </div>
          </div>

          <SoundSettings
            currentSoundId={selectedSoundId}
            onSoundChange={setSelectedSoundId}
            tenantId={tenant.id}
          />
        </div>

        {/* Idle Timeout / Screen Lock */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Clock className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('idleLock')}</h2>
              <p className="text-sm text-neutral-500">{t('autoLockDashboard')}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Enable/disable toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-100 bg-neutral-50/50">
              <div>
                <Label className="text-sm font-medium text-neutral-900">
                  {t('enableAutoLock')}
                </Label>
                <p className="text-xs text-neutral-500 mt-0.5">{t('screenLockedAfterIdle')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    watchIdleTimeoutMinutes !== null && watchIdleTimeoutMinutes !== undefined
                  }
                  onChange={(e) => {
                    setValue('idleTimeoutMinutes', e.target.checked ? 30 : null);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Timeout duration + lock mode (shown only when enabled) */}
            {watchIdleTimeoutMinutes !== null && watchIdleTimeoutMinutes !== undefined && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                {/* Duration */}
                <div className="flex items-center gap-4">
                  <Label
                    htmlFor="idleTimeoutMinutes"
                    className="text-sm text-neutral-600 whitespace-nowrap"
                  >
                    {t('idleTimeout')}
                  </Label>
                  <div className="relative w-28">
                    <Input
                      id="idleTimeoutMinutes"
                      type="number"
                      min={5}
                      max={120}
                      step={5}
                      {...register('idleTimeoutMinutes', { valueAsNumber: true })}
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                      min
                    </span>
                  </div>
                  <span className="text-xs text-neutral-400">{t('idleRange')}</span>
                </div>
                {errors.idleTimeoutMinutes && (
                  <p className="text-xs text-red-500">{errors.idleTimeoutMinutes.message}</p>
                )}

                {/* Lock mode */}
                <div className="space-y-2">
                  <Label className="text-sm text-neutral-600">{t('screenLockMode')}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setValue('screenLockMode', 'overlay')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        watchScreenLockMode === 'overlay'
                          ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-neutral-900">
                        {t('overlaySimple')}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{t('clickToUnlock')}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('screenLockMode', 'password')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        watchScreenLockMode === 'password'
                          ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-neutral-900">
                        {t('passwordRequired')}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{t('reenterPassword')}</div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-50 rounded-lg">
              <MapPin className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('contactInfo')}</h2>
              <p className="text-sm text-neutral-500">{t('addressAndContact')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="address">{t('fullAddress')}</Label>
              <Input id="address" {...register('address')} placeholder={t('addressPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input id="phone" {...register('phone')} placeholder={t('phonePlaceholder')} />
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{t('languageSection')}</h2>
              <p className="text-sm text-neutral-500">{t('languageDescription')}</p>
            </div>
          </div>

          <LocaleSwitcher />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="submit"
            variant="lime"
            disabled={saving || uploading}
            className="min-w-[150px]"
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
    </div>
  );
}
