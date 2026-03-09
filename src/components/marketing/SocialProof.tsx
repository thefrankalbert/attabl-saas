import { Calendar, Coins, Headphones, LayoutGrid } from 'lucide-react';

const stats = [
  { value: '14j', label: 'Essai gratuit', icon: Calendar },
  { value: '4', label: 'Modes de service', icon: LayoutGrid },
  { value: '3', label: 'Devises supportées', icon: Coins },
  { value: '24/7', label: 'Support disponible', icon: Headphones },
];

export default function SocialProof() {
  return (
    <section className="py-16 bg-app-card border-y border-app-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat) => (
            <div key={stat.value} className="flex flex-col items-center gap-2">
              <stat.icon className="size-6 text-app-text-muted" />
              <div className="text-3xl sm:text-4xl font-bold text-app-text">{stat.value}</div>
              <div className="text-sm text-app-text-secondary">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
