import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HeroVideo } from './HeroVideo';

// ponytail: affiche provisoire (photo du comptoir) tant que la video Attabl n'existe pas.
const HERO_POSTER = '/marketing/home/comptoir.webp';

export async function HomeHero({ videoSrc }: { videoSrc?: string }) {
  const t = await getTranslations('marketing.home.hero');
  const titleLines = t('title').split('\n');

  return (
    <section
      className="relative isolate flex min-h-[640px] items-end overflow-hidden bg-nuit text-white sm:min-h-[760px] lg:h-[calc(100svh-64px)] lg:max-h-[900px]"
      aria-labelledby="hero-titre"
    >
      {videoSrc ? (
        <HeroVideo src={videoSrc} poster={HERO_POSTER} />
      ) : (
        <Image
          src={HERO_POSTER}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
          data-hero-image
        />
      )}
      {/* Voile de lisibilite (fonctionnel, pas decoratif) */}
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0.15)_40%,rgba(0,0,0,0.72)_100%)]"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-[1440px] px-5 pb-10 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-[920px] text-center">
          <h1
            id="hero-titre"
            className="font-titre text-[48px] leading-[1] tracking-[-0.02em] sm:text-[72px] lg:text-[88px]"
          >
            {titleLines.map((line, i) => (
              <Fragment key={line}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </h1>
          <p className="mx-auto mt-6 max-w-[34rem] text-[17px] leading-[1.55] text-white/85 sm:text-[19px]">
            {t('subtitle')}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[16px] font-medium text-encre hover:bg-white/90 max-sm:w-full"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href="https://wa.me/237658651050"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/60 px-6 text-[16px] font-medium hover:bg-white/10 max-sm:w-full"
            >
              {t('ctaWhatsapp')}
            </a>
          </div>
        </div>
        {/* Preuve client en bas du hero */}
        <div className="mt-14 flex flex-col items-center gap-3 border-t border-white/20 pt-6 sm:flex-row sm:justify-center sm:gap-6">
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
