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
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-neutral-600 text-sm font-medium mb-2">
          <Building2 className="h-3.5 w-3.5" />
          Étape 1/5
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">
          Parlez-nous de votre établissement
        </h1>
        <p className="text-neutral-500 text-sm">
          Ces informations nous aident à personnaliser votre expérience.
        </p>
      </div>

      {/* Establishment Type */}
      <div className="mb-4">
        <Label className="text-neutral-700 font-semibold mb-2 block text-sm">
          Type d&apos;établissement
        </Label>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {establishmentTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => updateData({ establishmentType: type.id })}
              className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                data.establishmentType === type.id
                  ? 'border-neutral-900 bg-neutral-900/5'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <span className="text-lg block">{type.emoji}</span>
              <span className="font-medium text-neutral-900 text-xs">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-3 mb-4">
        <div>
          <Label
            htmlFor="address"
            className="text-neutral-700 font-semibold flex items-center gap-2 text-sm"
          >
            <MapPin className="h-3.5 w-3.5" />
            Adresse
          </Label>
          <Input
            id="address"
            type="text"
            placeholder="123 Rue Principale"
            value={data.address}
            onChange={(e) => updateData({ address: e.target.value })}
            className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city" className="text-neutral-700 font-semibold text-sm">
              Ville
            </Label>
            <Input
              id="city"
              type="text"
              placeholder="N'Djamena"
              value={data.city}
              onChange={(e) => updateData({ city: e.target.value })}
              className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
            />
          </div>
          <div>
            <Label htmlFor="country" className="text-neutral-700 font-semibold text-sm">
              Pays
            </Label>
            <Input
              id="country"
              type="text"
              placeholder="Cameroun"
              value={data.country}
              onChange={(e) => updateData({ country: e.target.value })}
              className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
            />
          </div>
        </div>
      </div>

      {/* Phone & Table Count inline */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor="phone"
            className="text-neutral-700 font-semibold flex items-center gap-2 text-sm"
          >
            <Phone className="h-3.5 w-3.5" />
            Téléphone
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+235 XX XX XX XX"
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
          />
        </div>
        <div>
          <Label
            htmlFor="tableCount"
            className="text-neutral-700 font-semibold flex items-center gap-2 text-sm"
          >
            <Users className="h-3.5 w-3.5" />
            Nombre de tables
          </Label>
          <Input
            id="tableCount"
            type="number"
            min="1"
            max="500"
            value={data.tableCount}
            onChange={(e) => updateData({ tableCount: parseInt(e.target.value) || 10 })}
            className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
          />
        </div>
      </div>
    </div>
  );
}
