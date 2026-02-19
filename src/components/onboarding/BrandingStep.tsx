/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Layout } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';

interface BrandingStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

const colorPresets = [
  { name: 'Lime', primary: '#CCFF00', secondary: '#000000' },
  { name: 'Ocean', primary: '#3B82F6', secondary: '#1E3A8A' },
  { name: 'Ruby', primary: '#EF4444', secondary: '#7F1D1D' },
  { name: 'Forest', primary: '#22C55E', secondary: '#14532D' },
  { name: 'Violet', primary: '#A855F7', secondary: '#581C87' },
  { name: 'Sunset', primary: '#F97316', secondary: '#7C2D12' },
  { name: 'Gold', primary: '#EAB308', secondary: '#422006' },
  { name: 'Rose', primary: '#EC4899', secondary: '#831843' },
  { name: 'Teal', primary: '#14B8A6', secondary: '#134E4A' },
  { name: 'Slate', primary: '#64748B', secondary: '#0F172A' },
  { name: 'Coral', primary: '#F97171', secondary: '#FFFFFF' },
  { name: 'Navy', primary: '#1E40AF', secondary: '#DBEAFE' },
  { name: 'Mint', primary: '#34D399', secondary: '#FFFFFF' },
  { name: 'Wine', primary: '#9F1239', secondary: '#FFF1F2' },
  { name: 'Charcoal', primary: '#374151', secondary: '#F3F4F6' },
  { name: 'Custom', primary: '', secondary: '' },
];

export function BrandingStep({ data, updateData }: BrandingStepProps) {
  const t = useTranslations('onboarding');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TODO: Phase 2 — upload to Supabase Storage
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 2MB check
    if (file.size > 2 * 1024 * 1024) return;

    const localUrl = URL.createObjectURL(file);
    updateData({ logoUrl: localUrl });
  };

  const removeLogo = () => {
    updateData({ logoUrl: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Title & Subtitle */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('brandingTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('brandingSubtitle')}</p>
      </div>

      {/* Logo Upload */}
      <div className="mb-6">
        <Label className="text-neutral-700 font-semibold mb-2 block text-sm">
          {t('logoLabel')}
        </Label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />

        <div className="flex items-start gap-4">
          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-[120px] h-[120px] shrink-0 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center overflow-hidden transition-colors hover:border-neutral-400"
          >
            {data.logoUrl ? (
              <>
                <img src={data.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLogo();
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
                  aria-label={t('logoDelete')}
                >
                  <X className="h-6 w-6 text-white" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-neutral-400 mb-1" />
                <span className="text-xs text-neutral-400 text-center px-2">{t('logoUpload')}</span>
              </>
            )}
          </button>

          <p className="text-xs text-neutral-400 mt-2">{t('logoMaxSize')}</p>
        </div>
      </div>

      {/* Color Presets */}
      <div className="mb-6">
        <Label className="text-neutral-700 font-semibold mb-2 block text-sm">
          {t('colorPresetsLabel')}
        </Label>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {colorPresets.map((preset) => {
            const isCustom = preset.name === 'Custom';
            const isSelected =
              !isCustom &&
              data.primaryColor === preset.primary &&
              data.secondaryColor === preset.secondary;

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  if (!isCustom) {
                    updateData({
                      primaryColor: preset.primary,
                      secondaryColor: preset.secondary,
                    });
                  }
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                  isSelected
                    ? 'ring-2 ring-[#CCFF00] ring-offset-2 border-transparent'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full border border-neutral-200"
                  style={
                    isCustom
                      ? {
                          background:
                            'conic-gradient(#EF4444, #EAB308, #22C55E, #3B82F6, #A855F7, #EF4444)',
                        }
                      : { backgroundColor: preset.secondary }
                  }
                >
                  {!isCustom && (
                    <div className="w-full h-full rounded-full flex items-center justify-center">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: preset.primary }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-medium text-neutral-500 truncate w-full text-center">
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Colors */}
      <div className="mb-6">
        <Label className="text-neutral-700 font-semibold mb-2 block text-sm">
          {t('customColorsLabel')}
        </Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="primaryColor" className="text-neutral-500 text-xs mb-1 block">
              {t('primaryColor')}
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="primaryColor"
                value={data.primaryColor}
                onChange={(e) => updateData({ primaryColor: e.target.value })}
                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-neutral-200 p-1"
              />
              <Input
                type="text"
                value={data.primaryColor}
                onChange={(e) => updateData({ primaryColor: e.target.value })}
                className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl font-mono uppercase text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="secondaryColor" className="text-neutral-500 text-xs mb-1 block">
              {t('secondaryColor')}
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="secondaryColor"
                value={data.secondaryColor}
                onChange={(e) => updateData({ secondaryColor: e.target.value })}
                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-neutral-200 p-1"
              />
              <Input
                type="text"
                value={data.secondaryColor}
                onChange={(e) => updateData({ secondaryColor: e.target.value })}
                className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl font-mono uppercase text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <Label htmlFor="description" className="text-neutral-700 font-semibold text-sm">
          {t('descriptionLabel')}
        </Label>
        <textarea
          id="description"
          placeholder={t('descriptionPlaceholder')}
          value={data.description}
          onChange={(e) => {
            if (e.target.value.length <= 500) {
              updateData({ description: e.target.value });
            }
          }}
          rows={3}
          maxLength={500}
          className="mt-1.5 w-full px-3 py-2 bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 rounded-xl resize-none transition-all text-sm"
        />
        <p className="text-xs text-neutral-400 mt-1 text-right">
          {t('charCount', { count: data.description.length, max: 500 })}
        </p>
      </div>

      {/* Live Preview */}
      <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
        <p className="text-xs text-neutral-500 mb-2 font-medium">{t('previewLabel')}</p>
        <div
          className="p-4 rounded-lg text-center"
          style={{ backgroundColor: data.secondaryColor }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ backgroundColor: data.primaryColor }}
          >
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <Layout className="h-5 w-5" style={{ color: data.secondaryColor }} />
            )}
            <span className="font-bold text-sm" style={{ color: data.secondaryColor }}>
              {data.tenantName || t('brandingTitle')}
            </span>
          </div>
          {data.description && (
            <p className="mt-2 text-xs opacity-80" style={{ color: data.primaryColor }}>
              {data.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
