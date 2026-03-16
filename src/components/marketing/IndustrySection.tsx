export default function IndustrySection() {
  const stats = [
    { number: '+2 400', label: 'commerces' },
    { number: '12', label: 'pays en Afrique' },
    { number: '98.7%', label: 'disponibilite' },
    { number: '+1.2M', label: 'commandes' },
  ];

  return (
    <section className="border-y border-neutral-200 bg-white py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-4xl font-bold text-neutral-900 sm:text-5xl">{stat.number}</p>
            <p className="mt-2 text-sm text-neutral-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
