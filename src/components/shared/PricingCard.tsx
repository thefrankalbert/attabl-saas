'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';
import { PLAN_AMOUNTS, PLAN_TOTALS } from '@/lib/stripe/pricing';
import { PLAN_NAMES } from '@/lib/plans/features';

export type PricingPlan = Exclude<SubscriptionPlan, 'enterprise'>;
export type { BillingInterval };

interface PricingCardProps {
  plan: PricingPlan;
  billingInterval: BillingInterval;
  isCurrentPlan?: boolean;
  onSelect: (plan: PricingPlan, interval: BillingInterval) => void;
  isLoading?: boolean;
}

const PLAN_DETAILS: Record<
  PricingPlan,
  { description: string; features: string[]; highlight: boolean }
> = {
  starter: {
    description: 'Pour démarrer',
    features: [
      '1 espace restaurant',
      '2 menus, 50 articles',
      'POS basique',
      'Support par email',
      'Photos HD',
    ],
    highlight: false,
  },
  pro: {
    description: 'Le plus populaire',
    features: [
      '10 menus, 500 articles',
      'POS complet + KDS',
      'Commande à table',
      'Inventaire & recettes',
      'Statistiques avancées',
      'Multi-devises',
    ],
    highlight: true,
  },
  business: {
    description: 'Multi-établissements',
    features: [
      "Jusqu'à 10 établissements",
      'Toutes les fonctions Pro',
      'Room Service & Livraison',
      'Analytics IA',
      'Staff illimité',
      'Support prioritaire',
    ],
    highlight: false,
  },
};

export function PricingCard({
  plan,
  billingInterval,
  isCurrentPlan,
  onSelect,
  isLoading,
}: PricingCardProps) {
  const details = PLAN_DETAILS[plan];
  const displayPrice = PLAN_AMOUNTS[plan][billingInterval];
  const yearlyTotal = PLAN_TOTALS[plan].yearly;

  return (
    <motion.div
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="h-full relative group"
    >
      {/* Background Gradient for Highlighted Card */}
      {details.highlight && (
        <div className="absolute -inset-[1px] bg-gradient-to-b from-[#CCFF00] to-transparent rounded-[24px] opacity-100 dark:opacity-100 blur-[2px] pointer-events-none" />
      )}

      <div
        className={`relative flex flex-col h-full overflow-hidden transition-all duration-300 rounded-[22px] border ${
          details.highlight
            ? 'bg-white dark:bg-[#121212] border-transparent shadow-none'
            : 'bg-white dark:bg-[#0A0A0A] border-neutral-100 dark:border-white/10 shadow-none'
        } group-hover:border-[#CCFF00]/30`}
      >
        {/* Inner Gradient for "Pro" feel on Dark Mode */}
        {details.highlight && (
          <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#CCFF00]/10 to-transparent pointer-events-none hidden dark:block" />
        )}

        <div className="p-8 flex flex-col h-full relative z-10">
          {/* Header */}
          <div className="mb-6">
            <h3
              className={`text-xl font-medium mb-2 ${
                details.highlight
                  ? 'text-black dark:text-white'
                  : 'text-black dark:text-neutral-300'
              }`}
            >
              {PLAN_NAMES[plan]}
            </h3>

            <div className="flex items-baseline gap-1">
              <span
                className={`text-5xl font-bold tracking-tighter ${
                  details.highlight ? 'text-black dark:text-white' : 'text-black dark:text-white'
                }`}
              >
                {displayPrice.toLocaleString('fr-FR')}
              </span>
              <span className="text-neutral-500 font-medium">/mois</span>
            </div>
            {billingInterval === 'yearly' && (
              <div className="mt-2 text-xs font-bold">
                <span className="text-green-600 dark:text-[#CCFF00] bg-green-50 dark:bg-[#CCFF00]/10 px-2 py-0.5 rounded">
                  -20% appliqué
                </span>
                <span className="text-neutral-400 block mt-1">
                  Facturé {yearlyTotal.toLocaleString('fr-FR')} F/an
                </span>
              </div>
            )}
            <p className="text-sm text-neutral-500 mt-4 h-10">{details.description}</p>
          </div>

          {/* Features */}
          <div className="space-y-4 flex-grow mb-8">
            {details.features.map((feature, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-neutral-400">
                <Check
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    details.highlight ? 'text-[#CCFF00]' : 'text-neutral-600 dark:text-neutral-600'
                  }`}
                />
                <span className="text-neutral-600 dark:text-neutral-400">{feature}</span>
              </div>
            ))}
          </div>

          {/* Button */}
          <Button
            onClick={() => onSelect(plan, billingInterval)}
            disabled={isLoading || isCurrentPlan}
            className={`w-full h-12 rounded-xl font-bold text-sm transition-all duration-200 focus-visible:ring-0 ${
              details.highlight
                ? 'bg-[#CCFF00] hover:bg-[#b3e600] text-black shadow-none'
                : 'bg-black dark:bg-white/10 text-white hover:bg-neutral-800 dark:hover:bg-white/20 border border-transparent dark:border-white/5 shadow-none'
            }`}
          >
            {isCurrentPlan
              ? 'Plan Actuel'
              : isLoading
                ? 'Chargement...'
                : details.highlight
                  ? 'Passer au Pro'
                  : 'Choisir ce plan'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
