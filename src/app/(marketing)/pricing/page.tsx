'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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

      {/* FAQ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-neutral-900 mb-12 text-center">
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
