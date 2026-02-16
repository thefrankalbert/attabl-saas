'use client';

import { Mail, Calendar, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitContactForm } from '@/app/actions/contact';
import { motion } from 'framer-motion';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-neutral-800 disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Envoi en cours...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          Demander un Rendez-vous
          <ArrowRight className="h-5 w-5" />
        </span>
      )}
    </button>
  );
}

export default function ContactPage() {
  const [formState, formAction] = useFormState(submitContactForm, {
    success: false,
    message: '',
  });

  return (
    <section className="pb-20 pt-32 md:pb-32 md:pt-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-24">
          {/* Left Column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-widest text-primary">
              Contact
            </p>

            <h1 className="mt-4 font-[family-name:var(--font-dm-serif-display)] text-5xl font-light leading-[1.1] text-neutral-900 md:text-6xl">
              Prendre
              <br />
              Rendez-vous.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-600">
              Vous souhaitez transformer l&apos;exp&eacute;rience client de votre
              &eacute;tablissement ? Discutons de vos besoins et planifions une d&eacute;mo
              personnalis&eacute;e.
            </p>

            <div className="mt-12 flex flex-col gap-8">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Email
                  </p>
                  <a
                    href="mailto:contact@attabl.com"
                    className="text-lg font-semibold text-neutral-900 transition-colors hover:text-primary"
                  >
                    contact@attabl.com
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Disponibilit&eacute;
                  </p>
                  <p className="text-lg font-semibold text-neutral-900">Lun - Ven, 9h - 18h</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm md:p-10">
              {formState.success ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-neutral-900">Demande Envoy&eacute;e !</h3>
                  <p className="mt-2 text-neutral-600">{formState.message}</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-8 rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50"
                  >
                    Envoyer un autre message
                  </button>
                </div>
              ) : (
                <form action={formAction} className="flex flex-col gap-6">
                  {/* Honeypot */}
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-semibold text-neutral-900">
                        Nom complet
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        required
                        placeholder="Jean Dupont"
                        className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                      {formState.errors?.name && (
                        <p className="text-xs text-red-500">{formState.errors.name[0]}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="company" className="text-sm font-semibold text-neutral-900">
                        &Eacute;tablissement
                      </label>
                      <input
                        type="text"
                        name="company"
                        id="company"
                        placeholder="H&ocirc;tel Le Plaza"
                        className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-semibold text-neutral-900">
                      Email professionnel
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      required
                      placeholder="jean@hotel-plaza.com"
                      className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                    {formState.errors?.email && (
                      <p className="text-xs text-red-500">{formState.errors.email[0]}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="date" className="text-sm font-semibold text-neutral-900">
                      Pr&eacute;f&eacute;rence de date/heure (Optionnel)
                    </label>
                    <input
                      type="text"
                      name="date"
                      id="date"
                      placeholder="Lundi prochain vers 14h..."
                      className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-semibold text-neutral-900">
                      Message / Besoins sp&eacute;cifiques
                    </label>
                    <textarea
                      name="message"
                      id="message"
                      rows={4}
                      required
                      placeholder="Je suis int&eacute;ress&eacute; par..."
                      className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                    {formState.errors?.message && (
                      <p className="text-xs text-red-500">{formState.errors.message[0]}</p>
                    )}
                  </div>

                  <SubmitButton />

                  <p className="mt-2 text-center text-xs text-neutral-500">
                    En envoyant ce formulaire, vous acceptez d&apos;&ecirc;tre contact&eacute; par
                    notre &eacute;quipe.
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
