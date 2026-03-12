'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

// ─── Africa Presence Map ──────────────────────────────────
const PRESENCE_COUNTRIES = [
  { name: 'Cameroun', cx: 108, cy: 102, color: '#4ade80' },
  { name: 'Tchad', cx: 118, cy: 78, color: '#60a5fa' },
  { name: 'Burkina Faso', cx: 72, cy: 86, color: '#f97316' },
] as const;

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

const AFRICA_HEX_GRID = (() => {
  const rows: Array<[number, number, number]> = [
    [4, 7, 12],
    [5, 6, 13],
    [6, 5, 14],
    [7, 5, 14],
    [8, 4, 14],
    [9, 4, 14],
    [10, 5, 13],
    [11, 5, 13],
    [12, 6, 13],
    [13, 7, 13],
    [14, 7, 12],
    [15, 8, 12],
    [16, 8, 12],
    [17, 9, 12],
    [18, 9, 11],
    [19, 10, 11],
    [20, 10, 11],
  ];
  const hexes: Array<{ x: number; y: number }> = [];
  const spacing = 11;
  for (const [row, colStart, colEnd] of rows) {
    const offsetX = row % 2 === 0 ? 0 : spacing / 2;
    for (let col = colStart; col <= colEnd; col++) {
      hexes.push({ x: col * spacing + offsetX, y: row * (spacing * 0.866) });
    }
  }
  return hexes;
})();

function AfricaPresenceSection() {
  return (
    <section className="py-16 bg-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-2 text-center">
          Déjà présent en Afrique
        </h2>
        <p className="text-neutral-600 text-center mb-10">
          ATTABL accompagne les restaurateurs et hôteliers à travers le continent.
        </p>

        <div className="flex flex-col items-center">
          {/* Africa hex map */}
          <svg viewBox="0 0 200 200" className="w-80 h-80" aria-hidden="true">
            {AFRICA_HEX_GRID.map((hex, i) => (
              <polygon key={i} points={hexPoints(hex.x, hex.y, 5)} fill="#e5e7eb" opacity={0.5} />
            ))}
            {PRESENCE_COUNTRIES.map((c) => (
              <g key={c.name}>
                <circle cx={c.cx} cy={c.cy} r={12} fill={c.color} opacity={0.15} />
                <circle cx={c.cx} cy={c.cy} r={6} fill={c.color} opacity={0.3} />
                <circle cx={c.cx} cy={c.cy} r={3} fill={c.color} opacity={0.7} />
              </g>
            ))}
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4">
            {PRESENCE_COUNTRIES.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-sm font-medium text-neutral-700">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const plans = [
  {
    name: 'Essentiel',
    price: '49',
    description: 'Pour démarrer',
    features: [
      'Menu digital & QR code',
      'Commandes dine-in + takeaway',
      '1 établissement',
      'Rapports basiques',
    ],
  },
  {
    name: 'Premium',
    price: '99',
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
  },
  {
    name: 'Enterprise',
    price: 'Sur mesure',
    description: 'Pour les groupes',
    features: [
      'Tout Premium +',
      'Support dédié',
      'SLA garanti',
      'Intégrations sur mesure',
      'Formation équipe',
    ],
  },
];

export default function PricingPage() {
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
            {plans.map((plan, idx) => (
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
                    {typeof plan.price === 'string' && plan.price.includes('Sur')
                      ? plan.price
                      : `${plan.price}€`}
                  </span>
                  {!plan.price.includes('Sur') && <span className="text-neutral-600">/mois</span>}
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
              </motion.div>
            ))}
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
