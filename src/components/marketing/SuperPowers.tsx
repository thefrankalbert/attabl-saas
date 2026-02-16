'use client';

import { motion } from 'framer-motion';
import { ClipboardList, Package, TrendingUp } from 'lucide-react';

const blocks = [
  {
    icon: ClipboardList,
    title: 'Commandes intelligentes',
    text: 'Dine-in, takeaway, livraison, room service. Vos commandes arrivent en cuisine en temps réel, organisées par course.',
  },
  {
    icon: Package,
    title: 'Stock au gramme près',
    text: 'Chaque commande déduit automatiquement les ingrédients. Plus de rupture imprévue, plus de surprise en fin de mois.',
  },
  {
    icon: TrendingUp,
    title: 'Rentabilité visible',
    text: 'Revenus quotidiens, plats les plus vendus, panier moyen, taxes. Tout calculé en temps réel.',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const blockVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

export default function SuperPowers() {
  return (
    <section className="py-20 bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
          Vos 3 super-pouvoirs
        </h2>
        <p className="text-center text-neutral-700 text-lg mb-16 max-w-2xl mx-auto">
          Commandes, stocks, rentabilité — trois piliers pour un établissement qui tourne.
        </p>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {blocks.map((block) => (
            <motion.div key={block.title} className="text-center p-8" variants={blockVariants}>
              <div className="w-14 h-14 rounded-2xl bg-brand-green-light flex items-center justify-center mx-auto mb-6">
                <block.icon className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-neutral-900 mb-3">
                {block.title}
              </h3>
              <p className="text-neutral-700 leading-relaxed">{block.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
