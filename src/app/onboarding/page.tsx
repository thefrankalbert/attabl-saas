'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layout,
  Check,
  ArrowRight,
  ArrowLeft,
  Building2,
  Palette,
  UtensilsCrossed,
  Rocket,
  SkipForward,
} from 'lucide-react';
import Link from 'next/link';

// Step Components
import { EstablishmentStep } from '@/components/onboarding/EstablishmentStep';
import { BrandingStep } from '@/components/onboarding/BrandingStep';
import { MenuStep } from '@/components/onboarding/MenuStep';
import { LaunchStep } from '@/components/onboarding/LaunchStep';

const steps = [
  { id: 1, name: 'Établissement', icon: Building2, description: 'Informations de base' },
  { id: 2, name: 'Personnalisation', icon: Palette, description: 'Logo et couleurs' },
  { id: 3, name: 'Menu', icon: UtensilsCrossed, description: 'Vos premiers articles' },
  { id: 4, name: 'Lancement', icon: Rocket, description: 'Prêt à démarrer' },
];

export interface OnboardingData {
  // Step 1: Establishment
  establishmentType: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  tableCount: number;
  // Step 2: Branding
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  // Step 3: Menu
  menuOption: 'manual' | 'import' | 'template' | 'skip';
  menuItems: Array<{ name: string; price: number; category: string }>;
  // Tenant info
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    establishmentType: 'restaurant',
    address: '',
    city: '',
    country: 'Cameroun',
    phone: '',
    tableCount: 10,
    logoUrl: '',
    primaryColor: '#CCFF00',
    secondaryColor: '#000000',
    description: '',
    menuOption: 'skip',
    menuItems: [],
    tenantId: '',
    tenantSlug: '',
    tenantName: '',
  });

  // Fetch current onboarding state
  useEffect(() => {
    const fetchOnboardingState = async () => {
      try {
        const res = await fetch('/api/onboarding/state');
        if (res.ok) {
          const state = await res.json();
          setData((prev) => ({
            ...prev,
            tenantId: state.tenantId,
            tenantSlug: state.tenantSlug,
            tenantName: state.tenantName,
            ...state.data,
          }));
          setCurrentStep(state.step || 1);
        }
      } catch (err) {
        console.error('Error fetching onboarding state:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOnboardingState();
  }, []);

  const updateData = (newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  };

  const saveStep = async () => {
    setSaving(true);
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: currentStep, data }),
      });
    } catch (err) {
      console.error('Error saving step:', err);
    } finally {
      setSaving(false);
    }
  };

  const nextStep = async () => {
    setError(null);
    await saveStep();
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const skipStep = () => {
    setError(null);
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors du lancement');
      }

      // Redirect to admin dashboard
      // Use /sites/{slug}/admin path on the main domain — works without wildcard DNS
      const origin = window.location.origin;
      window.location.href = `${origin}/sites/${data.tenantSlug}/admin`;
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 bg-[#CCFF00] rounded-xl" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Sidebar - Progress */}
      <div className="hidden lg:flex w-80 bg-black flex-col p-8 shrink-0">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 mb-12">
          <div className="bg-[#CCFF00] rounded-xl p-2">
            <Layout className="h-6 w-6 text-black" />
          </div>
          <span className="text-2xl font-bold text-white">ATTABL</span>
        </Link>

        {/* Steps */}
        <div className="flex-1">
          <p className="text-gray-500 text-sm mb-6">Configuration</p>
          <nav className="space-y-2">
            {steps.map((step) => {
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (isCompleted) {
                      setError(null);
                      setCurrentStep(step.id);
                    }
                  }}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left ${
                    isCurrent
                      ? 'bg-[#CCFF00]/10 border border-[#CCFF00]/30'
                      : isCompleted
                        ? 'opacity-60 hover:opacity-80 cursor-pointer'
                        : 'opacity-40 cursor-default'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isCompleted
                        ? 'bg-[#CCFF00] text-black'
                        : isCurrent
                          ? 'bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/50'
                          : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className={`font-medium ${isCurrent ? 'text-white' : 'text-white/70'}`}>
                      {step.name}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10">
          <p className="text-sm text-gray-500">
            {data.tenantName && (
              <>
                <span className="text-white font-medium">{data.tenantName}</span>
                <br />
              </>
            )}
            14 jours d&apos;essai gratuit
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b shrink-0">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-black rounded-lg p-1.5">
              <Layout className="h-4 w-4 text-[#CCFF00]" />
            </div>
            <span className="font-bold">ATTABL</span>
          </Link>
          <span className="text-sm text-gray-500">Étape {currentStep}/4</span>
        </div>

        {/* Progress Bar (Mobile) */}
        <div className="lg:hidden h-1 bg-gray-100 shrink-0">
          <div
            className="h-full bg-[#CCFF00] transition-all duration-500"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-12">
          <div className="max-w-2xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {currentStep === 1 && <EstablishmentStep data={data} updateData={updateData} />}
                {currentStep === 2 && <BrandingStep data={data} updateData={updateData} />}
                {currentStep === 3 && <MenuStep data={data} updateData={updateData} />}
                {currentStep === 4 && <LaunchStep data={data} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 sm:mx-6 lg:mx-12 mb-2 shrink-0">
            <div className="max-w-2xl mx-auto p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 ml-3 font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="border-t p-4 sm:p-6 lg:px-12 shrink-0">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-medium transition-all ${
                currentStep === 1
                  ? 'opacity-0 pointer-events-none'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Précédent</span>
            </button>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Skip button - shown on steps 1-3 */}
              {currentStep < 4 && (
                <button
                  onClick={skipStep}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-3 rounded-xl font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all text-sm"
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="hidden sm:inline">Passer</span>
                </button>
              )}

              {currentStep < 4 ? (
                <button
                  onClick={nextStep}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#CCFF00]/30"
                >
                  {saving ? 'Enregistrement...' : 'Continuer'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={completeOnboarding}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#CCFF00]/30"
                >
                  {saving ? 'Lancement...' : 'Accéder au Dashboard'}
                  <Rocket className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
