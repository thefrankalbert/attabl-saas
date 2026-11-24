'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export interface AudiencePanel {
  key: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
}

/** Trois panneaux : celui qui est survole, clique ou au focus s'ouvre. */
export function AudiencePanels({ panels }: { panels: AudiencePanel[] }) {
  const [active, setActive] = useState(0);

  return (
    <div data-panneaux className="home-panneaux mt-12">
      {panels.map((panel, i) => (
        <div
          key={panel.key}
          data-panneau
          data-revele
          data-actif={i === active || undefined}
          className="home-panneau"
          onPointerEnter={() => setActive(i)}
        >
          <Image
            src={panel.image}
            alt={panel.imageAlt}
            fill
            // object-cover d'une photo 16:10 dans un panneau de 380 ou 540 px de haut.
            sizes="(min-width: 1440px) 60vw, (min-width: 1024px) 864px, (min-width: 640px) 100vw, 608px"
          />
          <span className="home-panneau-voile" aria-hidden="true" />
          <div className="home-panneau-texte">
            <h3 className="font-titre text-[30px] leading-[1.08] sm:text-[36px]">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={i === active}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="home-panneau-bouton"
              >
                {panel.title}
              </Button>
            </h3>
            <p className="home-panneau-corps mt-3 text-[16px] leading-[1.6] text-white/85">
              {panel.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
