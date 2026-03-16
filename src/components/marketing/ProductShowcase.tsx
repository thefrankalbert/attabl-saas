'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';

const products = [
  {
    verb: 'PILOTER',
    title: 'Dashboard temps réel',
    description:
      "Suivez votre chiffre d'affaires, vos tendances et vos top produits en un coup d'\u0153il.",
    span: 2,
    hero: true,
  },
  {
    verb: 'VENDRE',
    title: 'Catalogue & commandes digitales',
    description: 'Menu QR, catalogue en ligne, commandes — vos clients achètent en autonomie.',
    span: 1,
  },
  {
    verb: 'PRÉPARER',
    title: 'Routage intelligent des commandes',
    description: 'Chaque commande est routée automatiquement vers la bonne équipe. Zéro oubli.',
    span: 1,
  },
  {
    verb: 'ENCAISSER',
    title: 'POS multi-méthodes',
    description: 'Cash, carte, mobile money — encaissez comme vos clients le souhaitent.',
    span: 1,
  },
  {
    verb: 'GÉRER',
    title: 'Stock, fournisseurs, alertes',
    description:
      'Suivi en temps réel, alertes de réapprovisionnement. Ne manquez plus jamais de stock.',
    span: 1,
  },
];

export default function ProductShowcase() {
  return (
    <section className="bg-app-bg py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <BlurFade delay={0} inView>
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:text-4xl">
              Cinq modules. Un seul outil.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-app-text-secondary">
              Du premier client au centième, ATTABL grandit avec vous.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {products.map((product, idx) => (
            <BlurFade key={product.verb} delay={idx * 0.1} inView>
              <div
                className={`relative overflow-hidden rounded-xl border border-app-border bg-app-card p-6 transition-colors hover:border-app-border-hover sm:p-8 ${
                  product.span === 2 ? 'min-h-[240px] md:col-span-2' : 'min-h-[180px]'
                }`}
              >
                {/* Border beam for hero card */}
                {product.hero && (
                  <BorderBeam size={150} duration={10} colorFrom="#CCFF00" colorTo="#7C3AED" />
                )}

                {/* Decorative chart bars for hero card */}
                {product.hero && (
                  <div className="absolute right-8 top-8 flex items-end gap-1.5 opacity-60">
                    <div className="h-8 w-3 rounded-sm bg-accent/20" />
                    <div className="h-14 w-3 rounded-sm bg-accent/20" />
                    <div className="h-20 w-3 rounded-sm bg-accent" />
                  </div>
                )}

                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                  {product.verb}
                </p>
                <h3 className="mb-2 text-xl font-bold text-app-text">{product.title}</h3>
                <p className="text-sm leading-relaxed text-app-text-secondary">
                  {product.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
