'use client';

import { createRef, useState, useSyncExternalStore, type RefObject } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface RangeCard {
  key: string;
  name: string;
  title: string;
  body: string;
  points: string[];
  cta: string;
  imageAlt: string;
}

// Classes completes (Tailwind ne voit pas les classes construites) : decalage
// sticky de chaque carte, ombre de la premiere, cadrage de chaque photo.
const CARD_CLASS: Record<string, string> = {
  comptoir: 'lg:top-[80px] shadow-[0_1px_0_rgba(0,0,0,0.04)]',
  service: 'lg:top-[96px]',
  cuisine: 'lg:top-[112px]',
  bureau: 'lg:top-[128px]',
};
const IMAGE_CLASS: Record<string, string> = {
  service: 'object-[50%_30%]',
};
// Photo de chaque carte (la carte Service reprend la photo de la serveuse).
const IMAGE_FILE: Record<string, string> = {
  service: 'serveuse',
};

const LG_QUERY = '(min-width: 1024px)';
function subscribeLg(onChange: () => void): () => void {
  const mql = window.matchMedia(LG_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const isLg = (): boolean => window.matchMedia(LG_QUERY).matches;
const isLgServer = (): boolean => false;

/**
 * Cartes de la gamme qui s'empilent au scroll (>= 1024 px uniquement) : quand
 * la carte suivante monte, la precedente recule (scale 1 -> 0.94, origine en
 * haut) et un calque noir passe de 0 a 25 % d'opacite. Pas de filter anime.
 * Rien sous 1024 px ni sous prefers-reduced-motion.
 */
export function RangeCardStack({ cards }: { cards: RangeCard[] }) {
  const [refs] = useState(() => cards.map(() => createRef<HTMLElement>()));
  const lg = useSyncExternalStore(subscribeLg, isLg, isLgServer);
  const reduce = useReducedMotion();
  const animated = lg && !reduce;

  return (
    <div data-pile className="mt-14 space-y-6">
      {cards.map((card, i) => {
        const next = refs[i + 1];
        return (
          <PileCard
            key={card.key}
            card={card}
            cardRef={refs[i]}
            // La derniere carte n'est jamais recouverte : elle suit sa propre
            // position sans appliquer d'effet.
            targetRef={next ?? refs[i]}
            animated={animated && next !== undefined}
          />
        );
      })}
    </div>
  );
}

function PileCard({
  card,
  cardRef,
  targetRef,
  animated,
}: {
  card: RangeCard;
  cardRef: RefObject<HTMLElement | null>;
  targetRef: RefObject<HTMLElement | null>;
  animated: boolean;
}) {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start end', 'start 80px'],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 0.25]);

  return (
    <motion.article
      ref={cardRef}
      className={cn(
        'carte-pile relative grid overflow-hidden rounded-[24px] bg-white text-encre md:grid-cols-2 lg:sticky lg:motion-reduce:relative lg:motion-reduce:top-auto dark:bg-encre dark:text-white',
        CARD_CLASS[card.key],
      )}
      style={animated ? { scale, transformOrigin: '50% 0%' } : { transformOrigin: '50% 0%' }}
    >
      <motion.span
        data-ombre
        className="pointer-events-none absolute inset-0 z-10 bg-black opacity-0"
        style={animated ? { opacity } : undefined}
        aria-hidden="true"
      />
      <div className="flex flex-col p-7 sm:p-10 md:max-lg:p-7 lg:p-10 xl:p-12">
        <p className="surtitre text-encre/65 dark:text-white/65">{card.name}</p>
        <h3 className="mt-4 font-titre text-[32px] leading-[1.08] sm:text-[42px] md:max-lg:text-[32px]">
          {card.title}
        </h3>
        <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.6] text-encre/70 dark:text-white/70">
          {card.body}
        </p>
        <ul className="mt-6 divide-y divide-trait border-y border-trait text-[16px]">
          {card.points.map((point) => (
            <li key={point} className="py-3">
              {point}
            </li>
          ))}
        </ul>
        <Link
          href="/features"
          className="mt-6 inline-flex w-fit items-center gap-2 text-[16px] font-medium underline decoration-1 underline-offset-[6px] hover:decoration-2"
        >
          {card.cta}
        </Link>
      </div>
      <div data-revele className="home-media-revele">
        <Image
          src={`/marketing/home/${IMAGE_FILE[card.key] ?? card.key}.webp`}
          alt={card.imageAlt}
          width={1400}
          height={1400}
          sizes="(min-width: 768px) 50vw, 100vw"
          className={IMAGE_CLASS[card.key] ?? 'object-center'}
        />
      </div>
    </motion.article>
  );
}
