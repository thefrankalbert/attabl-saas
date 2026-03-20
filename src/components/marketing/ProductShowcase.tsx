'use client';

const products = [
  {
    verb: 'PILOTER',
    title: 'Votre chiffre, en direct',
    description:
      'Recettes du jour, top plats, tendances de la semaine. Vous savez exactement où vous en êtes, à chaque instant.',
    span: 2,
    hero: true,
  },
  {
    verb: 'VENDRE',
    title: 'Votre menu, sans papier',
    description:
      'Le client scanne, consulte, commande. Bilingue, avec photos. Fini les menus plastifiés qui trainent.',
    span: 1,
  },
  {
    verb: 'PRÉPARER',
    title: 'Zéro oubli en cuisine',
    description:
      "Chaque commande arrive sur l'écran de la cuisine en temps réel. Plus besoin de crier entre la salle et les fourneaux.",
    span: 1,
  },
  {
    verb: 'ENCAISSER',
    title: 'Cash, carte ou mobile money',
    description: 'Encaissez comme vos clients paient. XAF, EUR, USD. Réconciliation automatique.',
    span: 1,
  },
  {
    verb: 'GÉRER',
    title: 'Stock sous contrôle',
    description:
      'Chaque plat vendu déduit les ingrédients. Alertes quand le stock est bas. Fini les surprises à la livraison.',
    span: 1,
  },
];

export default function ProductShowcase() {
  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-16 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
            Cinq modules. Un seul outil.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-500 dark:text-neutral-400">
            Du premier client au centième, ATTABL grandit avec vous.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {products.map((product) => (
            <div
              key={product.verb}
              className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-8 transition-shadow hover:shadow-lg ${
                product.span === 2 ? 'md:col-span-2' : ''
              }`}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                {product.verb}
              </p>
              <h3 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">
                {product.title}
              </h3>
              <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
                {product.description}
              </p>

              {/* Mini mockup for hero card */}
              {product.hero && (
                <div className="mt-6 flex gap-4">
                  {/* Mini bar chart 1 */}
                  <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-neutral-900 p-4">
                    <p className="mb-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                      Revenu mensuel
                    </p>
                    <div className="flex h-16 items-end gap-1">
                      {[40, 65, 50, 80, 70, 90, 75].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${i === 5 ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Mini bar chart 2 */}
                  <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-neutral-900 p-4">
                    <p className="mb-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                      Commandes / jour
                    </p>
                    <div className="flex h-16 items-end gap-1">
                      {[55, 70, 85, 60, 95, 45, 80].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${i === 4 ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
