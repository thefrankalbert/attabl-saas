'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

// ─── Africa Presence Map ──────────────────────────────────
const COVERED_COUNTRIES = [
  { name: 'Sénégal', x: 18, y: 35 },
  { name: 'Mali', x: 28, y: 32 },
  { name: 'Guinée', x: 20, y: 40 },
  { name: 'Burkina Faso', x: 32, y: 38 },
  { name: 'Niger', x: 40, y: 30 },
  { name: 'Bénin', x: 36, y: 44 },
  { name: 'Togo', x: 34, y: 44 },
  { name: "Côte d'Ivoire", x: 26, y: 44 },
  { name: 'Cameroun', x: 42, y: 48 },
  { name: 'Gabon', x: 42, y: 55 },
  { name: 'Congo', x: 48, y: 55 },
  { name: 'Tchad', x: 48, y: 35 },
];

function AfricaPresenceSection() {
  return (
    <section className="bg-[#1A1A2E] py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-white text-center mb-4">
          Présent dans toute l&apos;Afrique
        </h2>
        <p className="text-white/60 text-center mb-12">12 pays couverts et en expansion</p>

        <div className="max-w-lg mx-auto">
          <svg viewBox="0 0 100 100" className="w-full" aria-label="Carte de présence en Afrique">
            {/* Simplified Africa silhouette */}
            <path
              d="M30,8 Q38,5 45,8 Q52,10 55,15 Q58,12 62,14 Q65,18 63,22 Q68,25 65,30 Q62,28 58,30 Q60,35 58,40 Q62,42 60,48 Q58,52 60,58 Q62,62 58,68 Q55,72 52,78 Q48,82 45,85 Q42,88 38,90 Q35,92 32,90 Q28,88 30,82 Q28,78 25,75 Q22,72 20,68 Q18,62 16,55 Q14,48 15,42 Q14,38 16,34 Q15,30 18,26 Q16,22 18,18 Q20,14 24,12 Q27,10 30,8Z"
              className="fill-white/5 stroke-white/10"
              strokeWidth="0.5"
            />

            {/* Country dots with pulse animation */}
            {COVERED_COUNTRIES.map((country) => (
              <g key={country.name}>
                <circle cx={country.x} cy={country.y} r="3.5" className="fill-[#CCFF00]/20">
                  <animate attributeName="r" values="3.5;5;3.5" dur="3s" repeatCount="indefinite" />
                  <animate
                    attributeName="opacity"
                    values="0.3;0.1;0.3"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={country.x}
                  cy={country.y}
                  r="2"
                  className="fill-[#CCFF00] cursor-pointer hover:fill-[#CCFF00]/80 transition-colors"
                >
                  <title>{country.name}</title>
                </circle>
              </g>
            ))}
          </svg>
        </div>

        {/* Country names list */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-8">
          {COVERED_COUNTRIES.map((country) => (
            <span key={country.name} className="text-sm text-white/60">
              {country.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing Plans ──────────────────────────────────
const plans = [
  {
    name: 'Essentiel',
    priceMonthly: 49,
    priceAnnual: Math.round(49 * 0.8),
    description: 'Pour démarrer',
    features: [
      'Menu digital & QR code',
      'Commandes dine-in + takeaway',
      '1 établissement',
      'Rapports basiques',
    ],
    idealFor: 'restaurants, cafés, boutiques, salons',
  },
  {
    name: 'Premium',
    priceMonthly: 99,
    priceAnnual: Math.round(99 * 0.8),
    popular: true,
    description: 'Le plus populaire',
    features: [
      'Tout Essentiel +',
      'Stock & recettes automatisés',
      'KDS cuisine',
      'Multi-devises',
      'Delivery + room service',
      'Rapports avancés',
      'Multi-établissements',
    ],
    idealFor: 'hôtels, chaînes, multi-sites',
  },
  {
    name: 'Enterprise',
    priceMonthly: null,
    priceAnnual: null,
    description: 'Pour les groupes',
    features: [
      'Tout Premium +',
      'Support dédié',
      'SLA garanti',
      'Intégrations sur mesure',
      'Formation équipe',
    ],
    idealFor: 'franchises, grands groupes, collectivités',
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-6">
            Des tarifs simples et transparents
          </h1>
          <p className="text-lg sm:text-xl text-neutral-600 mb-4">
            14 jours gratuits sur tous les plans. Sans carte bancaire.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-20 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <span
              className={`text-sm font-medium ${!annual ? 'font-bold text-neutral-900' : 'text-neutral-500'}`}
            >
              Mensuel
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={annual}
              onClick={() => setAnnual(!annual)}
              className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer ${
                annual ? 'bg-[#CCFF00]' : 'bg-neutral-200'
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                  annual ? 'translate-x-7' : 'left-0.5'
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${annual ? 'font-bold text-neutral-900' : 'text-neutral-500'}`}
            >
              Annuel
            </span>
            <span className="text-xs bg-[#CCFF00]/10 text-[#CCFF00] px-2 py-0.5 rounded-full font-semibold">
              -20%
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
            {plans.map((plan, idx) => {
              const price = annual ? plan.priceAnnual : plan.priceMonthly;
              const isCustom = price === null;

              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className={`bg-white p-8 rounded-2xl ${
                    plan.popular ? 'border-2 border-primary shadow-lg' : 'border border-neutral-200'
                  }`}
                >
                  {plan.popular && (
                    <div className="mb-4 inline-block rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                      Populaire
                    </div>
                  )}
                  <h3 className="text-2xl font-bold text-neutral-900 mb-2">{plan.name}</h3>
                  <p className="text-sm text-neutral-600 mb-6">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-neutral-900">
                      {isCustom ? 'Sur mesure' : `${price}\u20AC`}
                    </span>
                    {!isCustom && (
                      <span className="text-neutral-600">
                        /mois{annual ? ' (facturé annuellement)' : ''}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/signup"
                    className={`block w-full text-center px-6 py-3 rounded-lg font-semibold transition-colors mb-6 ${
                      plan.popular
                        ? 'bg-black text-white hover:bg-neutral-900'
                        : 'border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white'
                    }`}
                  >
                    Commencer
                  </Link>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-neutral-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.idealFor && (
                    <p className="text-xs text-neutral-500 mt-4 pt-4 border-t border-neutral-100">
                      Idéal pour : {plan.idealFor}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Africa presence */}
      <AfricaPresenceSection />

      {/* FAQ */}
      <section className="py-20 bg-neutral-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-12 text-center">
            Questions fréquentes
          </h2>
          <div className="space-y-8">
            {[
              {
                q: "Comment fonctionne l'essai gratuit ?",
                a: "14 jours d'accès complet à toutes les fonctionnalités Premium, sans carte bancaire requise.",
              },
              {
                q: 'Puis-je changer de plan ?',
                a: 'Oui, à tout moment depuis votre tableau de bord.',
              },
              {
                q: 'Y a-t-il un engagement ?',
                a: 'Non, vous pouvez annuler à tout moment.',
              },
              {
                q: "Est-ce qu'ATTABL fonctionne pour mon type de commerce ?",
                a: "Oui ! ATTABL est conçu pour tous types de commerces : restaurants, hôtels, bars, cafés, boulangeries, food trucks, boutiques, épiceries, pharmacies, salons de coiffure et instituts de beauté. Notre système de terminologie contextuelle adapte automatiquement l'interface à votre secteur d'activité.",
              },
            ].map((faq) => (
              <div key={faq.q}>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{faq.q}</h3>
                <p className="text-neutral-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
