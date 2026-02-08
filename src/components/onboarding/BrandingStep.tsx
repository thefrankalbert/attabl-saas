/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, Upload, X, Layout } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface BrandingStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

const colorPresets = [
  { name: 'Lime', primary: '#CCFF00', secondary: '#000000' },
  { name: 'Blue', primary: '#3B82F6', secondary: '#1E3A8A' },
  { name: 'Red', primary: '#EF4444', secondary: '#7F1D1D' },
  { name: 'Green', primary: '#22C55E', secondary: '#14532D' },
  { name: 'Purple', primary: '#A855F7', secondary: '#581C87' },
  { name: 'Orange', primary: '#F97316', secondary: '#7C2D12' },
];

export function BrandingStep({ data, updateData }: BrandingStepProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // For now, create a local URL preview
      // In production, this would upload to Supabase Storage
      const localUrl = URL.createObjectURL(file);
      updateData({ logoUrl: localUrl });
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => {
    updateData({ logoUrl: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CCFF00]/10 text-[#CCFF00] text-sm font-bold mb-4">
          <Palette className="h-4 w-4" />
          Étape 2/4
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Personnalisez votre marque</h1>
        <p className="text-gray-500">Ajoutez votre logo et choisissez vos couleurs.</p>
      </div>

      {/* Logo Upload */}
      <div className="mb-8">
        <Label className="text-gray-700 font-semibold mb-3 block">
          Logo de votre établissement
        </Label>

        <div className="flex items-start gap-6">
          {/* Preview */}
          <div
            className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: data.logoUrl ? 'transparent' : data.primaryColor + '20' }}
          >
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Layout className="h-8 w-8 text-gray-400" />
            )}
          </div>

          {/* Upload Controls */}
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Upload...' : 'Uploader'}
              </button>

              {data.logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  Supprimer
                </button>
              )}
            </div>

            <p className="text-sm text-gray-500 mt-2">PNG, JPG ou SVG. Max 2MB.</p>
          </div>
        </div>
      </div>

      {/* Color Presets */}
      <div className="mb-6">
        <Label className="text-gray-700 font-semibold mb-3 block">Palette de couleurs</Label>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {colorPresets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() =>
                updateData({
                  primaryColor: preset.primary,
                  secondaryColor: preset.secondary,
                })
              }
              className={`p-3 rounded-xl border-2 transition-all ${
                data.primaryColor === preset.primary
                  ? 'border-gray-900 ring-2 ring-gray-900/10'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex gap-1 mb-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: preset.secondary }}
                />
              </div>
              <p className="text-xs font-medium text-gray-600">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Colors */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <Label htmlFor="primaryColor" className="text-gray-700 font-semibold">
            Couleur principale
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              id="primaryColor"
              value={data.primaryColor}
              onChange={(e) => updateData({ primaryColor: e.target.value })}
              className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
            />
            <Input
              type="text"
              value={data.primaryColor}
              onChange={(e) => updateData({ primaryColor: e.target.value })}
              className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl font-mono uppercase"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="secondaryColor" className="text-gray-700 font-semibold">
            Couleur secondaire
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              id="secondaryColor"
              value={data.secondaryColor}
              onChange={(e) => updateData({ secondaryColor: e.target.value })}
              className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
            />
            <Input
              type="text"
              value={data.secondaryColor}
              onChange={(e) => updateData({ secondaryColor: e.target.value })}
              className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl font-mono uppercase"
            />
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="text-gray-700 font-semibold">
          Description courte (optionnel)
        </Label>
        <p className="text-sm text-gray-500 mb-2">
          Cette description apparaîtra sur votre menu client.
        </p>
        <textarea
          id="description"
          placeholder="Bienvenue dans notre établissement..."
          value={data.description}
          onChange={(e) => updateData({ description: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-xl resize-none transition-all"
        />
      </div>

      {/* Live Preview */}
      <div className="mt-8 p-6 rounded-2xl border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500 mb-4">Aperçu</p>
        <div
          className="p-4 rounded-xl text-center"
          style={{ backgroundColor: data.secondaryColor }}
        >
          <div
            className="inline-flex items-center gap-3 px-4 py-2 rounded-full"
            style={{ backgroundColor: data.primaryColor }}
          >
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <Layout className="h-5 w-5" style={{ color: data.secondaryColor }} />
            )}
            <span className="font-bold" style={{ color: data.secondaryColor }}>
              {data.tenantName || 'Votre Établissement'}
            </span>
          </div>
          {data.description && (
            <p className="mt-4 text-sm opacity-80" style={{ color: data.primaryColor }}>
              {data.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
