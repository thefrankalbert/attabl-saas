'use client';

import { MapPin } from 'lucide-react';
import { GlobeAnalytics } from '@/components/ui/cobe-globe-analytics';

const markers = [
  { id: 'cm-dla', location: [4.05, 9.7] as [number, number], visitors: 127, trend: 15 },
  { id: 'cm-yde', location: [3.87, 11.52] as [number, number], visitors: 84, trend: 8 },
  { id: 'td-ndj', location: [12.13, 15.05] as [number, number], visitors: 43, trend: 22 },
  { id: 'bf-oua', location: [12.37, -1.52] as [number, number], visitors: 31, trend: 18 },
  { id: 'bf-bob', location: [11.18, -4.3] as [number, number], visitors: 12, trend: 25 },
];

export default function PresenceSection() {
  return (
    <section className="bg-white dark:bg-neutral-950 py-20 sm:py-28 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 dark:bg-white/10 px-4 py-1.5 text-sm font-normal text-neutral-600 dark:text-white/70 mb-6">
            <MapPin className="h-4 w-4" />
            Presence en Afrique
          </div>
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
            Deja present dans 3 pays
          </h2>
          <p className="mt-4 text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            ATTABL accompagne les professionnels de la restauration et de {"l'"}hotellerie en
            Afrique francophone.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <div className="w-full max-w-lg">
            <GlobeAnalytics markers={markers} speed={0.002} />
          </div>
        </div>
      </div>
    </section>
  );
}
