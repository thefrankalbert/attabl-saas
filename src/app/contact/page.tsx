'use client';

import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitContactForm } from '@/app/actions/contact';
import { motion } from 'framer-motion';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-neutral-800 disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Envoi en cours...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          Envoyer la demande
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}

export default function ContactPage() {
  const [formState, formAction] = useActionState(submitContactForm, {
    success: false,
    message: '',
  });

  return (
    <div className="flex h-screen w-full bg-white">
      {/* Left — Form on white */}
      <div className="flex w-full items-center justify-center bg-white px-8 sm:px-16 lg:w-[55%] lg:px-20">
        <div className="w-full max-w-[460px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Back to home */}
            <Link
              href="/"
              className="mb-8 inline-flex items-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <span className="mr-2">&larr;</span>
              Retour
            </Link>

            <h1 className="font-[family-name:var(--font-dm-serif-display)] text-3xl font-light leading-tight text-neutral-900 sm:text-4xl">
              Prenons rendez-vous
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-neutral-500">
              Remplissez le formulaire et notre &eacute;quipe vous recontactera sous 24h.
            </p>

            {formState.success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-8 text-center"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Demande envoy&eacute;e</h3>
                <p className="mt-2 text-sm text-neutral-600">{formState.message}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-6 rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50"
                >
                  Nouveau message
                </button>
              </motion.div>
            ) : (
              <form action={formAction} className="mt-8 flex flex-col gap-5">
                {/* Honeypot */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-xs font-semibold text-neutral-700">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      placeholder="Jean Dupont"
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                    {formState.errors?.name && (
                      <p className="text-xs text-red-500">{formState.errors.name[0]}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="company" className="text-xs font-semibold text-neutral-700">
                      &Eacute;tablissement
                    </label>
                    <input
                      type="text"
                      name="company"
                      id="company"
                      placeholder="H&ocirc;tel Le Plaza"
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-neutral-700">
                    Email professionnel
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    required
                    placeholder="jean@hotel-plaza.com"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  {formState.errors?.email && (
                    <p className="text-xs text-red-500">{formState.errors.email[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="message" className="text-xs font-semibold text-neutral-700">
                    Votre message
                  </label>
                  <textarea
                    name="message"
                    id="message"
                    rows={3}
                    required
                    placeholder="Parlez-nous de votre &eacute;tablissement et de vos besoins..."
                    className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  {formState.errors?.message && (
                    <p className="text-xs text-red-500">{formState.errors.message[0]}</p>
                  )}
                </div>

                <SubmitButton />

                <p className="text-center text-[11px] text-neutral-400">
                  En envoyant, vous acceptez d&apos;&ecirc;tre contact&eacute; par notre
                  &eacute;quipe.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>

      {/* Right — Dark panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] items-center py-6 pr-6 pl-3">
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[2rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-900" />
          <div className="absolute inset-0 bg-[url('/images/restaurant-ambiance.jpg')] bg-cover bg-center opacity-20" />
          <div className="absolute inset-0 bg-black/40" />

          <div className="relative z-10 flex flex-col items-center px-12 text-center lg:px-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <div className="mb-6 text-6xl">&#x1F37D;</div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">
                Une d&eacute;mo vaut
                <br />
                mille mots
              </h2>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                D&eacute;couvrez comment Attabl peut transformer la gestion de votre
                &eacute;tablissement en 20 minutes.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="mt-10 flex flex-col gap-4 w-full max-w-xs"
            >
              {[
                { stat: '20 min', label: 'D\u00e9mo personnalis\u00e9e' },
                { stat: '24h', label: 'D\u00e9lai de r\u00e9ponse' },
                { stat: '14 jours', label: 'Essai gratuit inclus' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-4 text-left">
                  <span className="min-w-[72px] text-2xl font-bold text-[#CCFF00]">
                    {item.stat}
                  </span>
                  <span className="text-sm text-white/60">{item.label}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
