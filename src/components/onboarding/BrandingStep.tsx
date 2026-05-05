/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  const [showSecondaryPicker, setShowSecondaryPicker] = useState(false);
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
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    updateData({ logoUrl: publicUrl });
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
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
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-app-text mb-1.5">{t('brandingTitle')}</h1>
            <p className="text-sm text-app-text-secondary">{t('brandingSubtitle')}</p>
          </div>

          {/* Two-column: Identity + Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Logo & Description */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-app-text-muted mb-4 pb-2.5 border-b border-app-border/50">
                {t('identitySection')}
              </p>

              {/* Logo Upload */}
              <div className="mb-5">
                <Label className="text-xs font-medium text-app-text-secondary mb-2 block">
                  {t('logoLabel')}
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
                    className="relative w-20 h-20 shrink-0 border-2 border-dashed border-app-border rounded-lg flex flex-col items-center justify-center gap-1.5 bg-app-elevated cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors overflow-hidden"
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
                        <Upload className="h-5 w-5 text-app-text-muted" />
                        <span className="text-[10px] text-app-text-muted text-center px-2 leading-tight">
                          PNG · JPG
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 pt-0.5">
                    <p className="text-xs text-app-text-muted leading-relaxed">
                      {t('logoMaxSize')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs h-8 px-3 rounded w-fit gap-1.5"
                    >
                      <Upload className="h-3 w-3" />
                      {data.logoUrl ? t('logoChange') : t('logoAdd')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <Label
                  htmlFor="description"
                  className="text-xs font-medium text-app-text-secondary mb-2 block"
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
                  rows={4}
                  maxLength={500}
                  className="w-full resize-none text-sm"
                />
                <p className="text-xs text-app-text-muted mt-1.5">{data.description.length}/500</p>
              </div>
            </div>

            {/* Right: Colors */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-app-text-muted mb-4 pb-2.5 border-b border-app-border/50">
                {t('colorsSection')}
              </p>

              <div className="space-y-4">
                {/* Primary Color */}
                <div>
                  <Label
                    htmlFor="primaryColor"
                    className="text-xs font-medium text-app-text-secondary mb-2 block"
                  >
                    {t('primaryColor')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover open={showPrimaryPicker} onOpenChange={setShowPrimaryPicker}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={t('colorPickerPrimary')}
                          className="w-9 h-9 rounded shrink-0 p-0 border border-black/10 hover:opacity-80 hover:bg-transparent transition-opacity"
                          style={{ backgroundColor: data.primaryColor }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="bottom" align="start">
                        <HexColorPicker
                          color={data.primaryColor || '#000000'}
                          onChange={(color) => updateData({ primaryColor: color })}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowPrimaryPicker(false)}
                          className="mt-2 h-8 px-4 text-xs font-semibold w-full"
                        >
                          {t('colorValidate')}
                        </Button>
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="text"
                      id="primaryColor"
                      value={data.primaryColor}
                      onChange={(e) => updateData({ primaryColor: e.target.value })}
                      className="h-9 bg-app-elevated/50 border-app-border rounded font-mono uppercase text-xs flex-1"
                    />
                  </div>
                </div>

                {/* Secondary Color */}
                <div>
                  <Label
                    htmlFor="secondaryColor"
                    className="text-xs font-medium text-app-text-secondary mb-2 block"
                  >
                    {t('secondaryColor')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover open={showSecondaryPicker} onOpenChange={setShowSecondaryPicker}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={t('colorPickerSecondary')}
                          className="w-9 h-9 rounded shrink-0 p-0 border border-black/10 hover:opacity-80 hover:bg-transparent transition-opacity"
                          style={{ backgroundColor: data.secondaryColor }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="bottom" align="start">
                        <HexColorPicker
                          color={data.secondaryColor || '#000000'}
                          onChange={(color) => updateData({ secondaryColor: color })}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowSecondaryPicker(false)}
                          className="mt-2 h-8 px-4 text-xs font-semibold w-full"
                        >
                          {t('colorValidate')}
                        </Button>
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="text"
                      id="secondaryColor"
                      value={data.secondaryColor}
                      onChange={(e) => updateData({ secondaryColor: e.target.value })}
                      className="h-9 bg-app-elevated/50 border-app-border rounded font-mono uppercase text-xs flex-1"
                    />
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
