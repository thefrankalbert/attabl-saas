'use client';

import { motion } from 'framer-motion';

const products = [
  {
    verb: 'PILOTER',
    title: 'Dashboard temps r\u00e9el',
    description:
      "Suivez votre chiffre d'affaires, vos tendances et vos top produits en un coup d'\u0153il.",
    span: 2,
    gradient: 'from-[#CCFF00]/5 to-[#CCFF00]/10',
  },
  {
    verb: 'VENDRE',
    title: 'Catalogue & commandes digitales',
    description:
      'Menu QR, catalogue en ligne, commandes \u2014 vos clients ach\u00e8tent en autonomie.',
    span: 1,
    gradient: 'from-purple-500/5 to-purple-500/10',
  },
  {
    verb: 'PR\u00c9PARER',
    title: 'Routage intelligent des commandes',
    description:
      'Chaque commande est rout\u00e9e automatiquement vers la bonne \u00e9quipe. Z\u00e9ro oubli.',
    span: 1,
    gradient: 'from-blue-500/5 to-blue-500/10',
  },
  {
    verb: 'ENCAISSER',
    title: 'POS multi-m\u00e9thodes',
    description: 'Cash, carte, mobile money \u2014 encaissez comme vos clients le souhaitent.',
    span: 1,
    gradient: 'from-amber-500/5 to-amber-500/10',
  },
  {
    verb: 'G\u00c9RER',
    title: 'Stock, fournisseurs, alertes',
    description:
      'Suivi en temps r\u00e9el, alertes de r\u00e9approvisionnement. Ne manquez plus jamais de stock.',
    span: 1,
    gradient: 'from-emerald-500/5 to-emerald-500/10',
  },
];

export default function ProductShowcase() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {products.map((product, idx) => (
            <motion.div
              key={product.verb}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={`overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br ${product.gradient} p-8 ${
                product.span === 2
                  ? 'min-h-[200px] md:col-span-2 md:min-h-[280px]'
                  : 'min-h-[200px]'
              }`}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#CCFF00]">
                {product.verb}
              </p>
              <h3
                className={`mb-3 font-bold text-neutral-900 ${
                  product.span === 2 ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
                }`}
              >
                {product.title}
              </h3>
              <p
                className={`text-neutral-600 leading-relaxed ${
                  product.span === 2 ? 'max-w-xl text-lg' : 'max-w-md'
                }`}
              >
                {product.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
