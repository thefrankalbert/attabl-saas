'use client';

import Link from 'next/link';

import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { BlurFade } from '@/components/ui/blur-fade';
import { Particles } from '@/components/ui/particles';

export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-app-card py-16 sm:py-24">
      {/* Ambient particles */}
      <Particles className="absolute inset-0" quantity={25} color="#4ade80" size={0.4} />

      <div className="relative z-10 mx-auto max-w-[700px] px-4 text-center">
        {/* Shiny badge */}
        <div className="mb-6 inline-flex rounded-full border border-app-border px-3 py-1">
          <AnimatedShinyText className="text-xs text-app-text-muted">
            Plateforme #1 en Afrique
          </AnimatedShinyText>
        </div>

        <BlurFade inView>
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-app-text sm:text-4xl lg:text-5xl">
            Votre commerce merite mieux qu&apos;un <span className="text-accent">carnet</span> et
            une <span className="text-accent">calculette</span>.
          </h2>
        </BlurFade>

        <BlurFade inView delay={0.1}>
          <p className="mx-auto mt-6 max-w-lg text-base text-app-text-secondary sm:text-lg">
            ATTABL est la plateforme commerce #1 en Afrique. Creez votre compte en 2 minutes et
            commencez a vendre aujourd&apos;hui.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="min-h-[44px] rounded-xl bg-accent px-8 py-4 font-bold text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
            >
              Creer mon compte gratuit
            </Link>
            <Link
              href="/contact"
              className="min-h-[44px] rounded-xl border border-app-border px-8 py-4 text-app-text transition-colors hover:bg-app-hover"
            >
              Parler a un conseiller
            </Link>
          </div>

          <p className="mt-8 text-xs tracking-wide text-app-text-muted">
            Utilise par 2 400+ commerces <span className="mx-1">·</span> Support WhatsApp 24/7{' '}
            <span className="mx-1">·</span> Disponible en francais et en anglais
          </p>
        </BlurFade>
      </div>
    </section>
  );
}
