'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, ArrowRight, Check, X, Building2, Sparkles } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  createRestaurantStep1Schema,
  createRestaurantStep2Schema,
  ESTABLISHMENT_TYPES,
  PLAN_OPTIONS,
} from '@/lib/validations/restaurant.schema';
import type {
  CreateRestaurantStep1Input,
  CreateRestaurantStep2Input,
} from '@/lib/validations/restaurant.schema';

// ─── Slug generator ─────────────────────────────────────────
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Type labels ────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  'bar-cafe': 'Bar / Cafe',
  boulangerie: 'Boulangerie / Patisserie',
  'dark-kitchen': 'Dark Kitchen',
  'food-truck': 'Food Truck',
  'quick-service': 'Restauration rapide',
};

// ─── Plan info ──────────────────────────────────────────────
const PLAN_INFO: Record<string, { label: string; price: string; description: string }> = {
  trial: {
    label: 'Essai gratuit',
    price: '0 F / 14 jours',
    description: 'Testez toutes les fonctionnalites sans engagement',
  },
  essentiel: {
    label: 'Essentiel',
    price: '39 800 F / mois',
    description: 'Menu digital, commandes, QR codes',
  },
  premium: {
    label: 'Premium',
    price: '79 800 F / mois',
    description: 'Tout Essentiel + rapports avances, POS, support prioritaire',
  },
};

interface AddRestaurantWizardProps {
  onClose: () => void;
  onSuccess: (slug: string) => void;
}

export function AddRestaurantWizard({ onClose, onSuccess }: AddRestaurantWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 data
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // Step 2 data
  const [plan, setPlan] = useState<string>('trial');

  // ─── Validation ──────────────────────────────────────────
  const step1Data: CreateRestaurantStep1Input = {
    name,
    type: type as CreateRestaurantStep1Input['type'],
    slug,
  };
  const step1Valid = createRestaurantStep1Schema.safeParse(step1Data).success;

  const step2Data: CreateRestaurantStep2Input = {
    plan: plan as CreateRestaurantStep2Input['plan'],
  };
  const step2Valid = createRestaurantStep2Schema.safeParse(step2Data).success;

  // ─── Auto-slug ───────────────────────────────────────────
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(nameToSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  // ─── Submit ──────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/restaurants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, slug, plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la creation');
      }

      onSuccess(data.slug);
    } catch (err) {
      logger.error('Restaurant creation failed', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-neutral-100 bg-white">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="border-b border-neutral-100 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#CCFF00] p-2">
              <Building2 className="h-5 w-5 text-black" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Nouvel etablissement</h2>
              <p className="text-xs text-neutral-400">Etape {step} sur 3</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-[#CCFF00]' : 'bg-neutral-100'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* ─── STEP 1: Info ────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-neutral-700">
                  Nom de l&apos;etablissement
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ex: Le Petit Bistrot"
                  className="h-11 rounded-lg border-neutral-200 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-sm font-medium text-neutral-700">
                  Type d&apos;etablissement
                </Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-11 rounded-lg border-neutral-200">
                    <SelectValue placeholder="Selectionnez un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTABLISHMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t] || t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug" className="text-sm font-medium text-neutral-700">
                  Adresse web (slug)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="le-petit-bistrot"
                    className="h-11 rounded-lg border-neutral-200 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20"
                  />
                  <span className="shrink-0 text-xs text-neutral-400">.attabl.com</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 2: Plan ───────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="mb-2 text-sm font-medium text-neutral-700">Choisissez votre formule</p>
              {PLAN_OPTIONS.map((p) => {
                const info = PLAN_INFO[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                      plan === p
                        ? 'border-[#CCFF00] bg-[#CCFF00]/5'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-neutral-900">{info.label}</p>
                        <p className="text-xs text-neutral-500">{info.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-neutral-900">{info.price}</p>
                        {plan === p && (
                          <div className="mt-1 flex items-center justify-end">
                            <Check className="h-4 w-4 text-[#7a9900]" />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── STEP 3: Summary ────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-neutral-50 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[#CCFF00]" />
                  <p className="text-sm font-bold text-neutral-900">Recapitulatif</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-neutral-500">Nom</span>
                    <span className="text-sm font-medium text-neutral-900">{name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-neutral-500">Type</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {TYPE_LABELS[type] || type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-neutral-500">Adresse</span>
                    <span className="text-sm font-medium text-neutral-900">{slug}.attabl.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-neutral-500">Formule</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {PLAN_INFO[plan]?.label || plan}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-neutral-500">Prix</span>
                    <span className="text-sm font-bold text-neutral-900">
                      {PLAN_INFO[plan]?.price || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-6 py-4">
          <Button
            variant="outline"
            onClick={step === 1 ? onClose : () => setStep(step - 1)}
            className="gap-2 rounded-lg border-neutral-200 text-sm text-neutral-600"
            disabled={loading}
          >
            {step === 1 ? (
              'Annuler'
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" />
                Retour
              </>
            )}
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !step1Valid : !step2Valid}
              className="gap-2 rounded-lg bg-[#CCFF00] text-sm font-semibold text-black hover:bg-[#b8e600] disabled:opacity-50"
            >
              Suivant
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="gap-2 rounded-lg bg-[#CCFF00] text-sm font-semibold text-black hover:bg-[#b8e600]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creation...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Creer l&apos;etablissement
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
