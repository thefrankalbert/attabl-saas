'use client';

import { motion } from 'framer-motion';
import { Smartphone, ShoppingBag, Package, BarChart3, Globe, Users } from 'lucide-react';

const categories = [
  {
    title: 'Menu & Commandes',
    features: [
      {
        icon: Smartphone,
        title: 'Menu digital bilingue',
        desc: 'QR code, FR/EN, modifiers payants',
      },
      {
        icon: ShoppingBag,
        title: '4 modes de service',
        desc: 'Dine-in, takeaway, delivery, room service',
      },
    ],
  },
  {
    title: 'Stock & Recettes',
    features: [
      { icon: Package, title: 'Stock automatisé', desc: 'Déstockage en temps réel par ingrédient' },
    ],
  },
  {
    title: 'Business',
    features: [
      { icon: BarChart3, title: 'Analytics temps réel', desc: 'Revenus, best-sellers, tendances' },
      { icon: Globe, title: 'Multi-devises', desc: 'XAF, EUR, USD' },
      { icon: Users, title: 'Multi-tenant', desc: 'Gérez plusieurs établissements' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-6">
            Tout ce dont vous avez besoin
          </h1>
          <p className="text-lg sm:text-xl text-neutral-600">
            Une plateforme complète pour gérer votre activité.
          </p>
        </div>
      </section>

      {categories.map((cat, catIdx) => (
        <section
          key={cat.title}
          className={`py-20 ${catIdx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-12">{cat.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {cat.features.map((feat, idx) => (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-white p-8 rounded-2xl border border-neutral-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                    <feat.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feat.title}</h3>
                  <p className="text-neutral-600 text-sm">{feat.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
