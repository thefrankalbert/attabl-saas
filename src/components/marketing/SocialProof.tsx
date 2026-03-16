const testimonials = [
  {
    quote:
      'ATTABL a transforme la gestion de notre restaurant. On a reduit les erreurs de commande de 40% en 2 mois.',
    author: 'Amadou K.',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restauration',
  },
  {
    quote:
      'Enfin un outil qui comprend le commerce africain. Le support mobile money a tout change pour nous.',
    author: 'Grace M.',
    business: 'Sahel Boutique',
    city: 'Douala',
    segment: 'Retail',
  },
  {
    quote:
      "Le dashboard analytics m'a ouvert les yeux sur mes vraies marges. J'ai augmente ma rentabilite de 18%.",
    author: 'Ibrahim D.',
    business: 'Hotel Prestige',
    city: 'Abidjan',
    segment: 'Hotellerie',
  },
];

const mediaPartners = ['Jeune Afrique', 'Forbes Afrique', 'TechCrunch', 'Le Monde'];

export default function SocialProof() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Ils nous font confiance
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.author} className="rounded-2xl bg-neutral-50 p-8">
              <p className="text-base leading-relaxed text-neutral-700">{t.quote}</p>

              <p className="mt-6 text-sm font-semibold text-neutral-900">{t.author}</p>
              <p className="text-sm text-neutral-500">
                {t.business} &mdash; {t.city}
              </p>

              <span className="mt-3 inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500">
                {t.segment}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center text-sm text-neutral-400">Partenaires medias</div>
        <div className="mt-4 flex justify-center gap-8">
          {mediaPartners.map((name) => (
            <span key={name} className="text-sm font-semibold text-neutral-300">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
