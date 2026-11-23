import type { CSSProperties } from 'react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';
import { MOSAIC_TILES, NARROW, WIDE, tileCenters } from './motion/motion-math';

// Positions posees en variables CSS : la scene est en place des le rendu serveur.
const wide = tileCenters(WIDE);
const narrow = tileCenters(NARROW);
const TILES = MOSAIC_TILES.map((key, i) => ({
  key,
  position: {
    '--x': wide[i].x,
    '--y': wide[i].y,
    '--x-mobile': narrow[i].x,
    '--y-mobile': narrow[i].y,
  } as CSSProperties,
}));

export async function HomeMosaic() {
  const t = await getTranslations('marketing.home.mosaic');

  return (
    <section data-champ className="home-champ" aria-labelledby="mosaique-titre">
      <h2
        id="mosaique-titre"
        className="mx-auto max-w-[24ch] text-balance text-center font-titre text-[36px] leading-[1.08] tracking-[-0.015em] text-encre sm:text-[52px] dark:text-white"
      >
        <AnimatedWords text={t('title')} masked />
      </h2>
      <ul className="home-champ-tuiles">
        {TILES.map(({ key, position }) => (
          <li key={key} data-tuile className="home-tuile" style={position}>
            <Image
              src={`/marketing/home/mosaique/${key}.webp`}
              alt={t(`images.${key}`)}
              width={360}
              height={360}
              sizes="(min-width: 768px) 170px, 110px"
              fetchPriority="low"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
