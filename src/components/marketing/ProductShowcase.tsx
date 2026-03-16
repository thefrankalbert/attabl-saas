'use client';

import { motion } from 'framer-motion';

const products = [
  {
    verb: 'PILOTER',
    title: 'Dashboard temps réel',
    description:
      "Suivez votre chiffre d'affaires, vos tendances et vos top produits en un coup d'\u0153il.",
    span: 2,
    dark: true,
    barColor: 'bg-[#CCFF00]',
  },
  {
    verb: 'VENDRE',
    title: 'Catalogue & commandes digitales',
    description: 'Menu QR, catalogue en ligne, commandes — vos clients achètent en autonomie.',
    span: 1,
    accentColor: 'bg-purple-500',
  },
  {
    verb: 'PRÉPARER',
    title: 'Routage intelligent des commandes',
    description: 'Chaque commande est routée automatiquement vers la bonne équipe. Zéro oubli.',
    span: 1,
    accentColor: 'bg-blue-500',
  },
  {
    verb: 'ENCAISSER',
    title: 'POS multi-méthodes',
    description: 'Cash, carte, mobile money — encaissez comme vos clients le souhaitent.',
    span: 1,
    accentColor: 'bg-amber-500',
  },
  {
    verb: 'GÉRER',
    title: 'Stock, fournisseurs, alertes',
    description:
      'Suivi en temps réel, alertes de réapprovisionnement. Ne manquez plus jamais de stock.',
    span: 1,
    accentColor: 'bg-emerald-500',
  },
];

export default function ProductShowcase() {
  return (
    <section className="bg-[#FAFAF9] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
            Cinq modules. Un seul outil.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-500">
            Du premier client au centième, ATTABL grandit avec vous.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {products.map((product, idx) => (
            <motion.div
              key={product.verb}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={`group relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                product.span === 2
                  ? 'min-h-[200px] md:col-span-2 md:min-h-[280px]'
                  : 'min-h-[200px]'
              } ${
                product.dark ? 'bg-[#0A0A0F] text-white' : 'border border-neutral-200/80 bg-white'
              }`}
            >
              {/* Top accent bar for light cards */}
              {!product.dark && product.accentColor && (
                <div className={`mb-6 h-1 w-12 rounded-full ${product.accentColor}`} />
              )}

              {/* Decorative chart bars for dark card */}
              {product.dark && (
                <div className="absolute right-8 top-8 flex items-end gap-1.5 opacity-60">
                  <div className="h-8 w-3 rounded-sm bg-[#CCFF00]/20" />
                  <div className="h-14 w-3 rounded-sm bg-[#CCFF00]/20" />
                  <div className="h-20 w-3 rounded-sm bg-[#CCFF00]" />
                </div>
              )}

              <p
                className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] ${
                  product.dark ? 'text-[#CCFF00]' : 'text-neutral-400'
                }`}
              >
                {product.verb}
              </p>
              <h3
                className={`mb-3 font-bold ${
                  product.dark ? 'text-white' : 'text-neutral-900'
                } ${product.span === 2 ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}
              >
                {product.title}
              </h3>
              <p
                className={`leading-relaxed ${
                  product.dark ? 'text-white/50' : 'text-neutral-600'
                } ${product.span === 2 ? 'max-w-xl text-lg' : 'max-w-md'}`}
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
