'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateTenantSettings } from '@/app/actions/tenant-settings';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import type { CurrencyCode } from '@/types/admin.types';
import type { UseFormReturn, FieldErrors } from 'react-hook-form';

// ─── Schema ────────────────────────────────────────────────

function createSettingsSchema(messages: { nameMinLength: string; invalidColor: string }) {
  return z.object({
    name: z.string().min(2, messages.nameMinLength),
    description: z.string().optional(),
    primaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, messages.invalidColor),
    secondaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, messages.invalidColor),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    phone: z.string().optional(),
    logo_url: z.string().optional(),
    // Establishment
    establishmentType: z.string().optional(),
    tableCount: z.number().int().min(0).max(500).optional(),
    // Billing fields
    currency: z.enum(['XAF', 'EUR', 'USD']).optional(),
    supportedCurrencies: z
      .array(z.enum(['XAF', 'EUR', 'USD']))
      .min(1)
      .optional(),
    enableTax: z.boolean().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    enableServiceCharge: z.boolean().optional(),
    serviceChargeRate: z.number().min(0).max(100).optional(),
    // Idle timeout
    idleTimeoutMinutes: z.number().int().min(5).max(120).nullable().optional(),
    screenLockMode: z.enum(['overlay', 'password']).optional(),
  });
}

export type SettingsFormValues = z.infer<ReturnType<typeof createSettingsSchema>>;

// ─── Types ─────────────────────────────────────────────────

export interface SettingsTenant {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  establishment_type?: string;
  table_count?: number;
  notification_sound_id?: string;
  currency?: CurrencyCode;
  supported_currencies?: CurrencyCode[];
  enable_tax?: boolean;
  tax_rate?: number;
  enable_service_charge?: boolean;
  service_charge_rate?: number;
  idle_timeout_minutes?: number | null;
  screen_lock_mode?: 'overlay' | 'password';
  custom_domain?: string | null;
}

export interface UseSettingsDataReturn {
  form: UseFormReturn<SettingsFormValues>;
  logoPreview: string | null;
  uploading: boolean;
  saving: boolean;
  selectedSoundId: string;
  setSelectedSoundId: (id: string) => void;
  hasUnsavedChanges: boolean;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (data: SettingsFormValues) => Promise<void>;
  onValidationError: (errors: FieldErrors<SettingsFormValues>) => void;
}

// ─── Hook ──────────────────────────────────────────────────

export function useSettingsData(tenant: SettingsTenant): UseSettingsDataReturn {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const settingsSchema = createSettingsSchema({
    nameMinLength: t('nameMinLength'),
    invalidColor: t('invalidColor'),
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialSoundId = tenant.notification_sound_id || 'classic-bell';
  const [selectedSoundId, setSelectedSoundId] = useState(initialSoundId);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: tenant.name,
      description: tenant.description || '',
      primaryColor: tenant.primary_color || '#000000',
      secondaryColor: tenant.secondary_color || '#FFFFFF',
      address: tenant.address || '',
      city: tenant.city || '',
      country: tenant.country || '',
      phone: tenant.phone || '',
      logo_url: tenant.logo_url || '',
      establishmentType: tenant.establishment_type || 'restaurant',
      tableCount: tenant.table_count ?? 10,
      currency: tenant.currency || 'XAF',
      supportedCurrencies: tenant.supported_currencies || [tenant.currency || 'XAF'],
      enableTax: tenant.enable_tax ?? false,
      taxRate: tenant.tax_rate ?? 0,
      enableServiceCharge: tenant.enable_service_charge ?? false,
      serviceChargeRate: tenant.service_charge_rate ?? 0,
      idleTimeoutMinutes: tenant.idle_timeout_minutes ?? 30,
      screenLockMode: tenant.screen_lock_mode ?? 'overlay',
    },
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t('invalidFileType'),
        description: t('logoAcceptedFormats'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t('fileTooLarge'),
        description: t('logoMaxSize'),
        variant: 'destructive',
      });
      return;
    }

    // Set local DataURL preview for immediate feedback
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Supabase Storage
    setUploading(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `${tenant.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('tenant-logos').getPublicUrl(filePath);

      form.setValue('logo_url', publicUrl);

      toast({
        title: t('logoUploaded'),
      });
    } catch (uploadErr) {
      logger.error('Failed to upload logo to storage', uploadErr);
      // Revert logo preview to original on failure
      setLogoPreview(tenant.logo_url || null);
      toast({
        title: tc('error'),
        description: t('logoUploadError'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const onValidationError = (errors: FieldErrors<SettingsFormValues>) => {
    const firstError = Object.values(errors)[0];
    const message =
      typeof firstError?.message === 'string' ? firstError.message : t('validationError');
    toast({
      title: t('validationErrorTitle'),
      description: message,
      variant: 'destructive',
    });
  };

  const onSubmit = async (data: SettingsFormValues) => {
    setSaving(true);
    try {
      // Prepare form data for server action
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description || '');
      formData.append('primaryColor', data.primaryColor);
      formData.append('secondaryColor', data.secondaryColor);
      formData.append('address', data.address || '');
      formData.append('city', data.city || '');
      formData.append('country', data.country || '');
      formData.append('phone', data.phone || '');
      if (data.logo_url) formData.append('logoUrl', data.logo_url);
      formData.append('notificationSoundId', selectedSoundId);
      formData.append('establishmentType', data.establishmentType || 'restaurant');
      formData.append('tableCount', String(data.tableCount ?? 10));
      // Billing fields — reset rates to 0 when toggle is off to avoid stale invalid values
      formData.append('currency', data.currency || 'XAF');
      if (data.supportedCurrencies) {
        formData.append('supportedCurrencies', JSON.stringify(data.supportedCurrencies));
      }
      formData.append('enableTax', data.enableTax ? 'true' : 'false');
      formData.append('taxRate', String(data.enableTax ? (data.taxRate ?? 0) : 0));
      formData.append('enableServiceCharge', data.enableServiceCharge ? 'true' : 'false');
      formData.append(
        'serviceChargeRate',
        String(data.enableServiceCharge ? (data.serviceChargeRate ?? 0) : 0),
      );
      // Idle timeout
      if (data.idleTimeoutMinutes !== null && data.idleTimeoutMinutes !== undefined) {
        formData.append('idleTimeoutMinutes', String(data.idleTimeoutMinutes));
      }
      formData.append('screenLockMode', data.screenLockMode || 'overlay');

      const result = await actionUpdateTenantSettings(formData);

      if (result.success) {
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

  const soundChanged = selectedSoundId !== initialSoundId;
  const hasUnsavedChanges = form.formState.isDirty || soundChanged;

  return {
    form,
    logoPreview,
    uploading,
    saving,
    selectedSoundId,
    setSelectedSoundId,
    hasUnsavedChanges,
    handleLogoUpload,
    onSubmit,
    onValidationError,
  };
}
