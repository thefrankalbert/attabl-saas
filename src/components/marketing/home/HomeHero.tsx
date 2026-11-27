import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';
import { WHATSAPP_LINK } from './whatsapp';

// Photo du hero.
const HERO_POSTER = '/marketing/home/hero-service.webp';

export async function HomeHero() {
  const t = await getTranslations('marketing.home.hero');
  const titleLines = t('title').split('\n');

  return (
    <section
      data-hero
      className="relative isolate flex min-h-[704px] items-end overflow-hidden bg-nuit text-white sm:min-h-[824px] lg:h-svh lg:max-h-[964px]"
      aria-labelledby="hero-titre"
    >
      {/* Media, voile et grain se reduisent ensemble quand le hero devient une tuile */}
      <div data-media className="home-hero-media">
        <Image
          src={HERO_POSTER}
          alt=""
          fill
          // Pas de prechargement prioritaire (mesure du 2026-11-24, mobile 4G
          // lente) : ce n'est pas l'element LCP (c'est le sous-titre), et ses
          // 85 Ko precharges en priorite haute partageaient le debit avec la
          // feuille de style qui bloque le premier affichage. Le texte du hero
          // s'affichait donc apres la photo. Chargee tout de suite, mais apres.
          loading="eager"
          fetchPriority="low"
          // object-cover : en portrait, c'est la hauteur qui fixe la largeur utile.
          // Pas d'unite svh ici : le prechargement la lisait autrement que
          // l'image et telechargeait une deuxieme taille (117 Ko de trop).
          sizes="(max-aspect-ratio: 1/1) 200vw, 100vw"
          className="object-cover"
          data-hero-image
        />
        {/* Voile de lisibilite (fonctionnel, pas decoratif) */}
        <div data-hero-voile className="home-hero-voile" aria-hidden="true" />
        <div className="home-grain" aria-hidden="true" />
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-5 pb-10 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-[920px] text-center">
          <h1
            id="hero-titre"
            className="font-titre text-[48px] leading-[1] tracking-[-0.02em] sm:text-[72px] lg:text-[88px]"
          >
            {titleLines.map((line, i) => (
              <Fragment key={line}>
                {i > 0 && <br />}
                {i > 0 && ' '}
                <AnimatedWords text={line} />
              </Fragment>
            ))}
          </h1>
          <p
            data-sort="sous"
            className="mx-auto mt-6 max-w-[34rem] text-[17px] leading-[1.55] text-white sm:text-[19px]"
          >
            {t('subtitle')}
          </p>
          <div
            data-sort="cta"
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[16px] font-medium text-encre hover:bg-white/90 max-sm:w-full"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/60 px-6 text-[16px] font-medium hover:bg-white/10 max-sm:w-full"
            >
              {t('ctaWhatsapp')}
            </a>
          </div>
        </div>
        {/* Preuve client en bas du hero */}
        <div
          data-sort="preuve"
          className="mt-14 flex flex-col items-center gap-3 border-t border-white/20 pt-6 sm:flex-row sm:justify-center sm:gap-6"
        >
          <span className="surtitre text-white/60">{t('proof')}</span>
          <Image
            src="/marketing/clients/radisson-blu-ndjamena-blanc.svg"
            alt={t('clientLogoAlt')}
            width={130}
            height={40}
            loading="eager"
            className="h-9 w-auto"
          />
        </div>
      </div>
    </section>
  );
}
