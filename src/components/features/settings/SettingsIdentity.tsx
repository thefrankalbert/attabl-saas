'use client';

import { Upload, Loader2, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TabsContent } from '@/components/ui/tabs';
import Image from 'next/image';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

// ─── Types ─────────────────────────────────────────────────

interface SettingsIdentityProps {
  form: UseFormReturn<SettingsFormValues>;
  tenant: { slug: string };
  logoPreview: string | null;
  uploading: boolean;
  saving: boolean;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
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
  t,
}: SettingsIdentityProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <TabsContent value="identity" className="mt-0">
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-app-text">{t('restaurantIdentity')}</h2>
              <p className="text-sm text-app-text-secondary">{t('clientVisibleInfo')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('restaurantName')}</Label>
                <Input id="name" {...register('name')} className="min-h-[44px]" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
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
            </div>

            <div className="space-y-4">
              <Label>{t('logo')}</Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div className="relative w-32 h-32 rounded-xl bg-app-elevated border-2 border-dashed border-app-border flex items-center justify-center overflow-hidden group hover:border-app-text-muted transition-colors">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-2"
                    />
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
                <div className="text-sm text-app-text-secondary">
                  <p>{t('recommendedFormat')}</p>
                  <p>{t('maxSize')}</p>
                  <p>{t('ratio')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Slug (read-only display) */}
        <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="slug">{t('slug') ?? 'Slug'}</Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
              {t('slugDescription') ?? 'Your unique subdomain. Contact support to change it.'}
            </p>
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
