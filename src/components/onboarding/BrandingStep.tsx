/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';
import { LogoCropper } from '@/components/onboarding/LogoCropper';
import { useToast } from '@/components/ui/use-toast';

interface BrandingStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}


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
              <p className="text-xs font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Identit\u00e9 visuelle
              </p>

              {/* Logo Upload */}
              <div className="mb-4">
                <Label className="text-sm font-medium text-app-text-secondary mb-3">
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
                    className="relative w-28 h-28 shrink-0 border border-dashed border-app-border rounded-xl flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-accent/40 transition-colors"
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
                        <span className="text-xs text-app-text-muted text-center px-2">
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
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-xs h-8 px-3 rounded-lg"
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
                  className="text-sm font-medium text-app-text-secondary mb-2"
                >
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
                  className="w-full px-4 py-3 bg-app-elevated/50 border border-app-border rounded-xl resize-none text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                />
                <p className="text-xs text-app-text-muted mt-1.5 text-right">
                  {t('charCount', { count: data.description.length, max: 500 })}
                </p>
              </div>
            </div>

            {/* Right: Colors */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Couleurs
              </p>

              {/* Custom Colors */}
              <div>
                <Label className="text-xs font-semibold text-app-text mb-2.5 block">
                  {t('customColorsLabel')}
                </Label>
                <div className="space-y-4">
                  {/* Primary */}
                  <div>
                    <Label
                      htmlFor="primaryColor"
                      className="text-xs font-medium text-app-text-secondary mb-1 block"
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
                        className="w-11 h-11 rounded-xl border border-app-border shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
                        style={{ backgroundColor: data.primaryColor }}
                      />
                      <Input
                        type="text"
                        value={data.primaryColor}
                        onChange={(e) => updateData({ primaryColor: e.target.value })}
                        className="h-10 bg-app-elevated/50 border-app-border rounded-xl font-mono uppercase text-xs"
                      />
                    </div>
                    {showPickerFor === 'primary' && (
                      <div className="mt-2">
                        <HexColorPicker
                          color={data.primaryColor || '#000000'}
                          onChange={(color) => updateData({ primaryColor: color })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Secondary */}
                  <div>
                    <Label
                      htmlFor="secondaryColor"
                      className="text-xs font-medium text-app-text-secondary mb-1 block"
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
                        className="w-11 h-11 rounded-xl border border-app-border shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
                        style={{ backgroundColor: data.secondaryColor }}
                      />
                      <Input
                        type="text"
                        value={data.secondaryColor}
                        onChange={(e) => updateData({ secondaryColor: e.target.value })}
                        className="h-10 bg-app-elevated/50 border-app-border rounded-xl font-mono uppercase text-xs"
                      />
                    </div>
                    {showPickerFor === 'secondary' && (
                      <div className="mt-2">
                        <HexColorPicker
                          color={data.secondaryColor || '#000000'}
                          onChange={(color) => updateData({ secondaryColor: color })}
                        />
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
