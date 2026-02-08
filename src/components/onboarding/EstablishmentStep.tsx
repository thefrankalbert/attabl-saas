'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, MapPin, Phone, Users } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

const establishmentTypes = [
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { id: 'hotel', label: 'Hôtel', emoji: '🏨' },
  { id: 'bar', label: 'Bar', emoji: '🍸' },
  { id: 'cafe', label: 'Café', emoji: '☕' },
  { id: 'fastfood', label: 'Fast-food', emoji: '🍔' },
  { id: 'other', label: 'Autre', emoji: '🏢' },
];

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function EstablishmentStep({ data, updateData }: EstablishmentStepProps) {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CCFF00]/10 text-[#CCFF00] text-sm font-bold mb-4">
          <Building2 className="h-4 w-4" />
          Étape 1/4
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Parlez-nous de votre établissement
        </h1>
        <p className="text-gray-500">
          Ces informations nous aident à personnaliser votre expérience.
        </p>
      </div>

      {/* Establishment Type */}
      <div className="mb-8">
        <Label className="text-gray-700 font-semibold mb-3 block">Type d&apos;établissement</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {establishmentTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => updateData({ establishmentType: type.id })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                data.establishmentType === type.id
                  ? 'border-[#CCFF00] bg-[#CCFF00]/10'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-2xl mb-2 block">{type.emoji}</span>
              <span className="font-medium text-gray-900">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4 mb-6">
        <div>
          <Label htmlFor="address" className="text-gray-700 font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Adresse
          </Label>
          <Input
            id="address"
            type="text"
            placeholder="123 Rue Principale"
            value={data.address}
            onChange={(e) => updateData({ address: e.target.value })}
            className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="city" className="text-gray-700 font-semibold">
              Ville
            </Label>
            <Input
              id="city"
              type="text"
              placeholder="N'Djamena"
              value={data.city}
              onChange={(e) => updateData({ city: e.target.value })}
              className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="country" className="text-gray-700 font-semibold">
              Pays
            </Label>
            <Input
              id="country"
              type="text"
              placeholder="Tchad"
              value={data.country}
              onChange={(e) => updateData({ country: e.target.value })}
              className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Phone */}
      <div className="mb-6">
        <Label htmlFor="phone" className="text-gray-700 font-semibold flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Téléphone
        </Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+235 XX XX XX XX"
          value={data.phone}
          onChange={(e) => updateData({ phone: e.target.value })}
          className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl"
        />
      </div>

      {/* Table Count */}
      <div>
        <Label htmlFor="tableCount" className="text-gray-700 font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Nombre de tables (approximatif)
        </Label>
        <Input
          id="tableCount"
          type="number"
          min="1"
          max="500"
          value={data.tableCount}
          onChange={(e) => updateData({ tableCount: parseInt(e.target.value) || 10 })}
          className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] rounded-xl w-32"
        />
      </div>
    </div>
  );
}
