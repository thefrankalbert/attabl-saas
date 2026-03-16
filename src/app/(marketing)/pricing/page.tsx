'use client';

import { useState } from 'react';
import Link from 'next/link';

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
    <section className="bg-white py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 text-center mb-4">
          Présent dans toute l&apos;Afrique
        </h2>
        <p className="text-neutral-500 text-center mb-12">12 pays couverts et en expansion</p>

        <div className="max-w-lg mx-auto">
          <svg viewBox="0 0 100 100" className="w-full" aria-label="Carte de présence en Afrique">
            {/* Simplified Africa silhouette */}
            <path
              d="M30,8 Q38,5 45,8 Q52,10 55,15 Q58,12 62,14 Q65,18 63,22 Q68,25 65,30 Q62,28 58,30 Q60,35 58,40 Q62,42 60,48 Q58,52 60,58 Q62,62 58,68 Q55,72 52,78 Q48,82 45,85 Q42,88 38,90 Q35,92 32,90 Q28,88 30,82 Q28,78 25,75 Q22,72 20,68 Q18,62 16,55 Q14,48 15,42 Q14,38 16,34 Q15,30 18,26 Q16,22 18,18 Q20,14 24,12 Q27,10 30,8Z"
              className="fill-neutral-50 stroke-neutral-200"
              strokeWidth="0.5"
            />

            {/* Country dots */}
            {COVERED_COUNTRIES.map((country) => (
              <g key={country.name}>
                <circle cx={country.x} cy={country.y} r="3.5" className="fill-neutral-900/10" />
                <circle
                  cx={country.x}
                  cy={country.y}
                  r="2"
                  className="fill-neutral-900 cursor-pointer hover:fill-neutral-700 transition-colors"
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
            <span key={country.name} className="text-sm text-neutral-500">
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
      {/* Hero + Pricing cards */}
      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl font-bold text-neutral-900">
              Des tarifs simples et transparents
            </h1>
            <p className="text-lg text-neutral-500 text-center mt-4">
              14 jours gratuits sur tous les plans. Sans carte bancaire.
            </p>

            {/* Billing toggle — pill style */}
            <div className="inline-flex bg-neutral-100 rounded-full p-1 mt-8">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                className={`px-5 py-2 text-sm font-medium cursor-pointer transition-all rounded-full ${
                  !annual ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                className={`px-5 py-2 text-sm font-medium cursor-pointer transition-all rounded-full ${
                  annual ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                Annuel
                <span className="ml-1.5 text-xs text-green-600 font-semibold">-20%</span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {plans.map((plan) => {
              const price = annual ? plan.priceAnnual : plan.priceMonthly;
              const isCustom = price === null;

              return (
                <div
                  key={plan.name}
                  className={`bg-white rounded-2xl p-8 ${
                    plan.popular
                      ? 'ring-2 ring-neutral-900 border border-transparent'
                      : 'border border-neutral-200'
                  }`}
                >
                  {plan.popular && (
                    <div className="mb-4">
                      <span className="bg-neutral-900 text-white text-xs px-3 py-1 rounded-full">
                        Populaire
                      </span>
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-neutral-900">{plan.name}</h3>
                  <p className="text-sm text-neutral-500 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-neutral-900">
                      {isCustom ? 'Sur mesure' : `${price}\u20AC`}
                    </span>
                    {!isCustom && (
                      <span className="text-sm text-neutral-500 ml-1">
                        /mois{annual ? ' (facturé annuellement)' : ''}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/signup"
                    className="block w-full text-center bg-neutral-900 text-white rounded-lg py-3 text-sm font-semibold mt-8 transition-colors hover:bg-neutral-800"
                  >
                    {isCustom ? 'Nous contacter' : 'Commencer'}
                  </Link>
                  <ul className="mt-8 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 shrink-0">&#10003;</span>
                        <span className="text-neutral-600 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.idealFor && (
                    <p className="text-xs text-neutral-500 mt-4 pt-4 border-t border-neutral-100">
                      Idéal pour : {plan.idealFor}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Africa presence */}
      <AfricaPresenceSection />

      {/* FAQ */}
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 mb-12 text-center">
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
                <h3 className="font-semibold text-neutral-900">{faq.q}</h3>
                <p className="text-neutral-600 mt-2">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
