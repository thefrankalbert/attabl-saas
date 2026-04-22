/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Type } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';
import { LogoCropper } from '@/components/onboarding/LogoCropper';
import { useToast } from '@/components/ui/use-toast';

interface BrandingStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

const colorPresets = [
  { name: 'ATTABL', primary: '#2e7d32', secondary: '#1b5e20' },
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

const colorGrid = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#F43F5E',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0D9488',
  '#2563EB',
  '#4F46E5',
  '#9333EA',
  '#DB2777',
  '#E11D48',
  '#000000',
  '#374151',
  '#6B7280',
  '#9CA3AF',
  '#FFFFFF',
];

export function BrandingStep({ data, updateData }: BrandingStepProps) {
  const t = useTranslations('onboarding');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPickerFor, setShowPickerFor] = useState<'primary' | 'secondary' | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast({
        title: t('logoFileTooLarge'),
        variant: 'destructive',
      });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = (publicUrl: string) => {
    updateData({ logoUrl: publicUrl });
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
  };

  const handleCropError = (message: string) => {
    toast({
      title: t('uploadError'),
      description: message,
      variant: 'destructive',
    });
  };

  const removeLogo = () => {
    updateData({ logoUrl: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isPresetSelected = (preset: (typeof colorPresets)[number]) =>
    data.primaryColor === preset.primary && data.secondaryColor === preset.secondary;
  const hasPresetMatch = colorPresets.some(isPresetSelected);

  return (
    <div className="h-full flex flex-col">
      {/* Logo Cropper Modal */}
      {cropSrc && (
        <LogoCropper
          imageSrc={cropSrc}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
          onError={handleCropError}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
          {/* Header */}
          <div className="mb-4">
            <h1 className="text-lg font-bold text-app-text mb-1">{t('brandingTitle')}</h1>
            <p className="text-app-text-secondary text-sm">{t('brandingSubtitle')}</p>
          </div>

          {/* Two-column: Logo & Description + Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Logo & Description */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Identit\u00e9 visuelle
              </p>

              {/* Logo Upload */}
              <div className="mb-4">
                <Label className="text-sm font-normal text-app-text-secondary mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-app-text-muted" />
                  {t('logoLabel') || 'Logo'}
                </Label>
                {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />

                <div className="flex items-start gap-4">
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
                    className="relative w-28 h-28 shrink-0 border border-dashed border-app-border rounded-[10px] flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-accent/40 transition-colors"
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
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
                          aria-label={t('logoDelete')}
                        >
                          <X className="h-5 w-5 text-white" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-app-text-muted mb-1.5" />
                        <span className="text-[10px] text-app-text-muted text-center px-2">
                          {t('logoUpload')}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="pt-3">
                    <p className="text-xs text-app-text-muted">{t('logoMaxSize')}</p>
                    {data.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-xs text-accent hover:underline h-auto p-0"
                      >
                        {t('logoChange')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <Label
                  htmlFor="description"
                  className="text-sm font-normal text-app-text-secondary flex items-center gap-2 mb-2"
                >
                  <Type className="h-4 w-4 text-app-text-muted" />
                  {t('descriptionLabel')}
                </Label>
                <Textarea
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
                  className="w-full px-4 py-3 bg-app-elevated/50 border border-app-border rounded-[10px] resize-none text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                />
                <p className="text-xs text-app-text-muted mt-1.5 text-right">
                  {t('charCount', { count: data.description.length, max: 500 })}
                </p>
              </div>
            </div>

            {/* Right: Colors */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Couleurs
              </p>

              {/* Presets */}
              <div className="mb-4">
                <Label className="text-xs font-bold text-app-text mb-2.5 block">
                  {t('colorPresetsLabel')}
                </Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {colorPresets.map((preset) => {
                    const isSelected = isPresetSelected(preset);
                    return (
                      <Button
                        key={preset.name}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          updateData({
                            primaryColor: preset.primary,
                            secondaryColor: preset.secondary,
                          });
                        }}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-[10px] border transition-all h-auto ${
                          isSelected
                            ? 'border-accent bg-accent/5'
                            : 'border-app-border hover:border-app-border-hover'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg border border-app-border/50 flex items-center justify-center"
                          style={{ backgroundColor: preset.secondary }}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-md"
                            style={{ backgroundColor: preset.primary }}
                          />
                        </div>
                        <span className="text-[7px] font-bold text-app-text-muted truncate w-full text-center">
                          {preset.name}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Colors */}
              <div>
                <Label className="text-xs font-bold text-app-text mb-2.5 block">
                  {t('customColorsLabel')}
                  {!hasPresetMatch && (
                    <span className="ml-1.5 text-[10px] text-accent">(actif)</span>
                  )}
                </Label>
                <div className="space-y-4">
                  {/* Primary */}
                  <div>
                    <Label
                      htmlFor="primaryColor"
                      className="text-xs font-normal text-app-text-secondary mb-1 block"
                    >
                      {t('primaryColor')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setShowPickerFor(showPickerFor === 'primary' ? null : 'primary')
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowPickerFor(showPickerFor === 'primary' ? null : 'primary');
                          }
                        }}
                        className="w-11 h-11 rounded-[10px] border border-app-border shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
                        style={{ backgroundColor: data.primaryColor }}
                      />
                      <Input
                        type="text"
                        value={data.primaryColor}
                        onChange={(e) => updateData({ primaryColor: e.target.value })}
                        className="h-10 bg-app-elevated/50 border-app-border rounded-[10px] font-mono uppercase text-xs"
                      />
                    </div>
                    {showPickerFor === 'primary' && (
                      <div className="mt-2 grid grid-cols-5 gap-2 p-3 rounded-[10px] bg-app-elevated/50 border border-app-border">
                        {colorGrid.map((color) => (
                          <Button
                            key={color}
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              updateData({ primaryColor: color });
                              setShowPickerFor(null);
                            }}
                            className={`w-9 h-9 rounded-lg border transition-all p-0 min-w-0 ${
                              data.primaryColor === color
                                ? 'border-accent scale-110'
                                : 'border-transparent hover:border-app-border-hover'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Secondary */}
                  <div>
                    <Label
                      htmlFor="secondaryColor"
                      className="text-xs font-normal text-app-text-secondary mb-1 block"
                    >
                      {t('secondaryColor')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setShowPickerFor(showPickerFor === 'secondary' ? null : 'secondary')
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowPickerFor(showPickerFor === 'secondary' ? null : 'secondary');
                          }
                        }}
                        className="w-11 h-11 rounded-[10px] border border-app-border shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
                        style={{ backgroundColor: data.secondaryColor }}
                      />
                      <Input
                        type="text"
                        value={data.secondaryColor}
                        onChange={(e) => updateData({ secondaryColor: e.target.value })}
                        className="h-10 bg-app-elevated/50 border-app-border rounded-[10px] font-mono uppercase text-xs"
                      />
                    </div>
                    {showPickerFor === 'secondary' && (
                      <div className="mt-2 grid grid-cols-5 gap-2 p-3 rounded-[10px] bg-app-elevated/50 border border-app-border">
                        {colorGrid.map((color) => (
                          <Button
                            key={color}
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              updateData({ secondaryColor: color });
                              setShowPickerFor(null);
                            }}
                            className={`w-9 h-9 rounded-lg border transition-all p-0 min-w-0 ${
                              data.secondaryColor === color
                                ? 'border-accent scale-110'
                                : 'border-transparent hover:border-app-border-hover'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
