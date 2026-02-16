'use client';

import { motion } from 'framer-motion';

const features = [
  {
    title: 'Menu digital intelligent',
    description: 'QR code, bilingue, modifiers — votre menu accessible partout, tout le temps.',
  },
  {
    title: 'Analytics en temps réel',
    description: 'Revenus, best-sellers, tendances — pilotez votre activité avec précision.',
  },
  {
    title: 'Stock automatisé',
    description: 'Chaque commande déduit vos ingrédients. Fini les ruptures imprévues.',
  },
  {
    title: 'Multi-devises',
    description: 'XAF, EUR, USD — facturez dans la devise locale de vos clients.',
  },
];

export default function FeaturesShowcase() {
  return (
    <section className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
            Tout ce qu&apos;il faut pour réussir
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Une plateforme complète qui grandit avec vous.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="bg-neutral-50 p-8 rounded-2xl border border-neutral-200 transition-all duration-300 hover:border-neutral-400 hover:shadow-sm"
            >
              <h3 className="text-xl font-semibold text-neutral-900 mb-3">{feature.title}</h3>
              <p className="text-neutral-600 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
