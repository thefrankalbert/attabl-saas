import Link from 'next/link';
import { Bike, MonitorCheck, BarChart3 } from 'lucide-react';

export default function DarkKitchensPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight">
            Optimisé pour la livraison
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 max-w-2xl mx-auto mt-6">
            KDS multi-marques, analytics temps réel, delivery optimisé.
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
                icon: Bike,
                title: 'Delivery optimisé',
                description:
                  'Intégration avec les plateformes de livraison. Centralisez toutes vos commandes Uber Eats, Deliveroo et autres en un seul endroit.',
              },
              {
                icon: MonitorCheck,
                title: 'KDS multi-marques',
                description:
                  'Gérez plusieurs concepts depuis la même cuisine. Séparez les flux de commandes par marque virtuelle sans confusion.',
              },
              {
                icon: BarChart3,
                title: 'Analytics temps réel',
                description:
                  'Suivez vos performances par plateforme, par plat, par heure. Identifiez vos best-sellers et optimisez votre menu en continu.',
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
            Prêt à digitaliser votre dark kitchen ?
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
