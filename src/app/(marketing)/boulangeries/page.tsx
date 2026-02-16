'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BookOpen, Package, Truck } from 'lucide-react';

export default function BoulangeriesPage() {
  return (
    <>
      {/* Hero moderne */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 mb-6"
          >
            Artisanat et précision
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto mb-10"
          >
            Gérez vos recettes, ingrédients et stocks avec la rigueur de l&apos;artisan boulanger.
          </motion.p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center bg-black text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-neutral-900 transition-colors"
          >
            Commencer gratuitement
          </Link>
        </div>
      </section>

      {/* Features - 3 cards spacieuses */}
      <section className="py-20 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: BookOpen,
                title: 'Fiches techniques précises',
                description:
                  'Définissez vos recettes au gramme près : farine T65, levure, sel. Calculez le coût matière exact de chaque production.',
              },
              {
                icon: Package,
                title: 'Stock automatique',
                description:
                  'Chaque vente déduit automatiquement les ingrédients utilisés. Vous savez en temps réel ce qu&apos;il vous reste en stock.',
              },
              {
                icon: Truck,
                title: 'Suivi fournisseurs',
                description:
                  'Enregistrez vos achats et livraisons. Historique complet par fournisseur avec prix et quantités pour optimiser vos commandes.',
              },
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-8 rounded-2xl border border-neutral-200"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 mb-3">{feature.title}</h3>
                <p className="text-neutral-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-6">
            Prêt à digitaliser votre établissement ?
          </h2>
          <p className="text-lg text-neutral-600 mb-10">14 jours gratuits. Sans carte bancaire.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center bg-black text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-neutral-900 transition-colors"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center border-2 border-neutral-900 text-neutral-900 px-8 py-4 rounded-lg text-base font-semibold hover:bg-neutral-900 hover:text-white transition-colors"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
