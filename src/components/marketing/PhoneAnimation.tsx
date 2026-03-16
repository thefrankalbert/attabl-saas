const moments = [
  {
    time: '08H · MATIN',
    message:
      'Stock de cafe bas. Commande fournisseur suggeree : 5kg Arabica chez votre fournisseur habituel.',
    action: 'Commander',
    insight: 'ATTABL AI anticipe vos besoins avant que vous ne les ressentiez.',
  },
  {
    time: '13H · RUSH',
    message:
      'Temps de preparation moyen : 8 min. 2 commandes en retard — reallocation suggeree vers le poste 2.',
    action: 'Reallouer',
    insight: 'En plein rush, ATTABL AI optimise vos operations en temps reel.',
  },
  {
    time: '21H · CLOTURE',
    message:
      'Journee record ! +15% vs mardi dernier. Votre top 3 : Burger Classic, Salade Cesar, Jus Gingembre.',
    action: 'Voir le rapport',
    insight: 'ATTABL AI transforme vos donnees en decisions rentables.',
  },
];

export default function PhoneAnimation() {
  return (
    <section className="bg-neutral-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Votre copilote business
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-neutral-500 sm:text-lg">
          ATTABL AI analyse votre activite et vous suggere les bonnes decisions.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {moments.map((m) => (
            <div key={m.time}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {m.time}
              </p>

              <div className="rounded-xl border border-neutral-200 bg-white p-6">
                <p className="text-sm leading-relaxed text-neutral-700">{m.message}</p>
                <p className="mt-4 text-xs font-semibold text-neutral-900">{m.action} &rarr;</p>
              </div>

              <p className="mt-4 text-xs italic text-neutral-500">{m.insight}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
