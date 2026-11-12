'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateTenantSettings } from '@/app/actions/tenant-settings';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { openingHoursSchema } from '@/lib/validations/tenant.schema';
import {
  establishmentDetailsSchema,
  type EstablishmentDetails,
} from '@/lib/validations/establishment-details.schema';
import type { CurrencyCode, OpeningHoursMap } from '@/types/admin.types';
import type { UseFormReturn, FieldErrors } from 'react-hook-form';

// --- Schema ------------------------------------------------

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
    establishmentDetails: establishmentDetailsSchema.optional(),
    // Billing fields
    currency: z.enum(['XAF', 'XOF', 'EUR', 'USD']).optional(),
    supportedCurrencies: z
      .array(z.enum(['XAF', 'XOF', 'EUR', 'USD']))
      .min(1)
      .optional(),
    enableTax: z.boolean().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    enableServiceCharge: z.boolean().optional(),
    serviceChargeRate: z.number().min(0).max(100).optional(),
    enableCoupons: z.boolean().optional(),
    // KDS
    barDisplayEnabled: z.boolean().optional(),
    // Idle timeout
    idleTimeoutMinutes: z.number().int().min(5).max(120).nullable().optional(),
    screenLockMode: z.enum(['overlay', 'password']).optional(),
    // Opening hours
    openingHours: openingHoursSchema.optional(),
  });
}

export type SettingsFormValues = z.infer<ReturnType<typeof createSettingsSchema>>;

// --- Types -------------------------------------------------

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
  establishment_details?: EstablishmentDetails;
  notification_sound_id?: string;
  currency?: CurrencyCode;
  supported_currencies?: CurrencyCode[];
  enable_tax?: boolean;
  tax_rate?: number;
  enable_service_charge?: boolean;
  service_charge_rate?: number;
  enable_coupons?: boolean;
  bar_display_enabled?: boolean;
  idle_timeout_minutes?: number | null;
  screen_lock_mode?: 'overlay' | 'password';
  opening_hours?: OpeningHoursMap | null;
  custom_domain?: string | null;
}

export interface UseSettingsDataReturn {
  form: UseFormReturn<SettingsFormValues>;
  logoPreview: string | null;
  saving: boolean;
  selectedSoundId: string;
  setSelectedSoundId: (id: string) => void;
  hasUnsavedChanges: boolean;
  handleLogoChange: (url: string) => void;
  handleLogoRemove: () => void;
  onSubmit: (data: SettingsFormValues) => Promise<void>;
  onValidationError: (errors: FieldErrors<SettingsFormValues>) => void;
}

// --- Hook --------------------------------------------------

export function useSettingsData(tenant: SettingsTenant): UseSettingsDataReturn {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const settingsSchema = createSettingsSchema({
    nameMinLength: t('nameMinLength'),
    invalidColor: t('invalidColor'),
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url || null);
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
      establishmentDetails: tenant.establishment_details ?? {},
      currency: tenant.currency || 'XAF',
      supportedCurrencies: tenant.supported_currencies || [tenant.currency || 'XAF'],
      enableTax: tenant.enable_tax ?? false,
      taxRate: tenant.tax_rate ?? 0,
      enableServiceCharge: tenant.enable_service_charge ?? false,
      serviceChargeRate: tenant.service_charge_rate ?? 0,
      enableCoupons: tenant.enable_coupons ?? false,
      barDisplayEnabled: tenant.bar_display_enabled ?? false,
      // null = idle lock disabled; preserve it instead of silently re-enabling
      idleTimeoutMinutes: tenant.idle_timeout_minutes ?? null,
      screenLockMode: tenant.screen_lock_mode ?? 'overlay',
      openingHours: tenant.opening_hours ?? {},
    },
  });

  // ponytail: le logo passe par ImageUpload (recadrage + /api/upload, 10 Mo).
  // L'ancien gestionnaire de fichier (limite 2 Mo) n'etait branche nulle part:
  // il est retire avec son etat `uploading` (audit C-079).
  // Called by ImageUpload after crop+upload is done
  const handleLogoChange = (url: string) => {
    setLogoPreview(url);
    form.setValue('logo_url', url);
    toast({ title: t('logoUploaded') });
  };

  const handleLogoRemove = () => {
    setLogoPreview(null);
    form.setValue('logo_url', '');
  };

  const onValidationError = (errors: FieldErrors<SettingsFormValues>) => {
    // Les erreurs imbriquees (horaires, details) n'ont pas de `message` au premier niveau:
    // on descend jusqu'au premier message reel (audit C-075).
    const findMessage = (node: unknown): string | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      const record = node as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message) return record.message;
      for (const [key, value] of Object.entries(record)) {
        if (key === 'ref') continue;
        const found = findMessage(value);
        if (found) return found;
      }
      return undefined;
    };
    const message = findMessage(errors) ?? t('validationError');
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
      // Always sent (even empty) so a full save can clear the logo; the service
      // only skips fields that are entirely absent from the FormData.
      formData.append('logoUrl', data.logo_url ?? '');
      formData.append('notificationSoundId', selectedSoundId);
      formData.append('establishmentType', data.establishmentType || 'restaurant');
      // tableCount is not editable from Settings (no control), so it is not sent
      // here - the partial-PATCH action leaves the stored value untouched.
      formData.append('establishmentDetails', JSON.stringify(data.establishmentDetails ?? {}));
      // Billing fields - reset rates to 0 when toggle is off to avoid stale invalid values
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
      formData.append('enableCoupons', data.enableCoupons ? 'true' : 'false');
      // KDS
      formData.append('barDisplayEnabled', data.barDisplayEnabled ? 'true' : 'false');
      // Idle timeout - empty string means "disabled" (null); always sent so a
      // full save persists the disabled state instead of leaving it untouched.
      formData.append(
        'idleTimeoutMinutes',
        data.idleTimeoutMinutes == null ? '' : String(data.idleTimeoutMinutes),
      );
      formData.append('screenLockMode', data.screenLockMode || 'overlay');
      // Opening hours (always sent on a full settings save)
      formData.append('openingHours', JSON.stringify(data.openingHours ?? {}));

      const result = await actionUpdateTenantSettings(formData);

      if (result.success) {
        toast({
          title: t('settingsUpdated'),
          description: t('settingsSavedSuccess'),
        });
      } else {
        // Le serveur dit POURQUOI il refuse (ex : "La description ne doit pas
        // depasser 500 caracteres"). Ce message etait jete au profit d'un
        // "Une erreur est survenue" generique, et la raison ne se lisait que
        // dans la console (audit 2026-11-10, C-070).
        toast({
          title: tc('error'),
          description: result.error || t('settingsSaveError'),
          variant: 'destructive',
        });
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
    saving,
    selectedSoundId,
    setSelectedSoundId,
    hasUnsavedChanges,
    handleLogoChange,
    handleLogoRemove,
    onSubmit,
    onValidationError,
  };
}
