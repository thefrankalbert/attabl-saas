/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Layout, Paintbrush, Type, Image } from 'lucide-react';
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
];

type BrandingTab = 'logo' | 'colors' | 'description';

export function BrandingStep({ data, updateData }: BrandingStepProps) {
  const t = useTranslations('onboarding');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<BrandingTab>('logo');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const tabs: { id: BrandingTab; icon: typeof Image; label: string }[] = [
    { id: 'logo', icon: Image, label: t('logoLabel') },
    { id: 'colors', icon: Paintbrush, label: t('colorPresetsLabel') },
    { id: 'description', icon: Type, label: t('descriptionLabel') },
  ];

  // Check if current colors match a preset
  const isPresetSelected = (preset: (typeof colorPresets)[number]) =>
    data.primaryColor === preset.primary && data.secondaryColor === preset.secondary;
  const hasPresetMatch = colorPresets.some(isPresetSelected);

  return (
    <div className="flex flex-col">
      {/* Title & Subtitle */}
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('brandingTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('brandingSubtitle')}</p>
      </div>

      {/* Live Preview — always visible */}
      <div className="border border-neutral-200 rounded-xl p-3 bg-neutral-50 mb-4">
        <p className="text-[10px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wide">
          {t('previewLabel')}
        </p>
        <div
          className="p-3 rounded-lg text-center"
          style={{ backgroundColor: data.secondaryColor }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: data.primaryColor }}
          >
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <Layout className="h-4 w-4" style={{ color: data.secondaryColor }} />
            )}
            <span className="font-bold text-xs" style={{ color: data.secondaryColor }}>
              {data.tenantName || 'Mon établissement'}
            </span>
          </div>
          {data.description && (
            <p className="mt-1.5 text-[10px] opacity-80" style={{ color: data.primaryColor }}>
              {data.description}
            </p>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-100 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-[#CCFF00] text-neutral-900 bg-neutral-50'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'logo' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />

          <div className="flex items-start gap-4">
            {/* Drop zone — using div instead of button to avoid nesting issue */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !data.logoUrl && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!data.logoUrl) fileInputRef.current?.click();
                }
              }}
              className="relative w-[100px] h-[100px] shrink-0 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-neutral-400"
            >
              {data.logoUrl ? (
                <>
                  <img src={data.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLogo();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        removeLogo();
                      }
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100"
                    aria-label={t('logoDelete')}
                  >
                    <X className="h-5 w-5 text-white" />
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-neutral-400 mb-1" />
                  <span className="text-[10px] text-neutral-400 text-center px-2">
                    {t('logoUpload')}
                  </span>
                </>
              )}
            </div>
            <div className="pt-2">
              <p className="text-xs text-neutral-400">{t('logoMaxSize')}</p>
              {data.logoUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-700"
                >
                  {t('logoChange')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'colors' && (
        <div>
          {/* Presets */}
          <div className="mb-4">
            <Label className="text-neutral-700 font-medium mb-2 block text-xs">
              {t('colorPresetsLabel')}
            </Label>
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
              {colorPresets.map((preset) => {
                const isSelected = isPresetSelected(preset);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      updateData({
                        primaryColor: preset.primary,
                        secondaryColor: preset.secondary,
                      });
                    }}
                    className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border ${
                      isSelected
                        ? 'ring-2 ring-[#CCFF00] ring-offset-1 border-transparent'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center"
                      style={{ backgroundColor: preset.secondary }}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: preset.primary }}
                      />
                    </div>
                    <span className="text-[8px] font-medium text-neutral-500 truncate w-full text-center">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Colors */}
          <div>
            <Label className="text-neutral-700 font-medium mb-2 block text-xs">
              {t('customColorsLabel')}
              {!hasPresetMatch && (
                <span className="ml-1.5 text-[10px] text-neutral-400">(actif)</span>
              )}
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="primaryColor" className="text-neutral-500 text-[10px] mb-1 block">
                  {t('primaryColor')}
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="primaryColor"
                    value={data.primaryColor}
                    onChange={(e) => updateData({ primaryColor: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-neutral-200 p-0.5"
                  />
                  <Input
                    type="text"
                    value={data.primaryColor}
                    onChange={(e) => updateData({ primaryColor: e.target.value })}
                    className="h-9 bg-neutral-50 border-neutral-200 rounded-xl font-mono uppercase text-xs"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="secondaryColor" className="text-neutral-500 text-[10px] mb-1 block">
                  {t('secondaryColor')}
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="secondaryColor"
                    value={data.secondaryColor}
                    onChange={(e) => updateData({ secondaryColor: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-neutral-200 p-0.5"
                  />
                  <Input
                    type="text"
                    value={data.secondaryColor}
                    onChange={(e) => updateData({ secondaryColor: e.target.value })}
                    className="h-9 bg-neutral-50 border-neutral-200 rounded-xl font-mono uppercase text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'description' && (
        <div>
          <Label htmlFor="description" className="text-neutral-700 font-medium text-xs">
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
            rows={4}
            maxLength={500}
            className="mt-1.5 w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl resize-none text-sm"
          />
          <p className="text-xs text-neutral-400 mt-1 text-right">
            {t('charCount', { count: data.description.length, max: 500 })}
          </p>
        </div>
      )}
    </div>
  );
}
