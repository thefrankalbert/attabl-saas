import Link from 'next/link';
import { Zap, MonitorCheck, Ticket } from 'lucide-react';

export default function QuickServicePage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight">
            Rapidité sans compromis
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 max-w-2xl mx-auto mt-6">
            Commandes ultra-rapides, KDS optimisé, coupons & promotions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link
              href="/signup"
              className="bg-neutral-900 text-white rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-800 transition-colors"
            >
              Démarrer gratuitement
            </Link>
            <Link
              href="/pricing"
              className="border border-neutral-300 text-neutral-900 rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-50 transition-colors"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>

      {/* Features - 3 cards */}
      <section className="py-20 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Commandes ultra-rapides',
                description:
                  'Interface POS optimisée pour la vitesse. Prenez une commande complète en quelques secondes avec raccourcis et suggestions intelligentes.',
              },
              {
                icon: MonitorCheck,
                title: 'KDS vitesse',
                description:
                  'Écrans cuisine synchronisés pour enchaîner les préparations. Chaque item est tracé de la commande à la livraison.',
              },
              {
                icon: Ticket,
                title: 'Coupons & promotions',
                description:
                  'Créez des offres flash, menus duo, happy hours. Fidélisez avec des réductions automatiques sur les produits phares.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-neutral-200 p-8"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center mb-5">
                  <feature.icon className="h-5 w-5 text-neutral-700" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-3">{feature.title}</h3>
                <p className="text-neutral-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900">
            Prêt à digitaliser votre service rapide ?
          </h2>
          <p className="text-lg text-neutral-500 mt-4">
            Essai gratuit 14 jours. Sans carte bancaire.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-neutral-900 text-white rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-800 transition-colors mt-8"
          >
            Démarrer gratuitement
          </Link>
        </div>
      </section>
    </>
  );
}
