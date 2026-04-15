'use client';

import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { actionSubmitContactForm } from '@/app/actions/contact';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('contact');
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl px-6 py-3.5 text-sm font-semibold text-white hover:bg-neutral-800 dark:hover:bg-neutral-100"
      style={{
        backgroundColor: pending ? 'rgba(0, 0, 0, 0.5)' : undefined,
      }}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('submitting')}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          {t('submitButton')}
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
    </Button>
  );
}

export default function ContactPage() {
  const t = useTranslations('contact');
  const [formState, formAction] = useActionState(actionSubmitContactForm, {
    success: false,
    message: '',
  });

  return (
    <div className="flex min-h-dvh w-full bg-white dark:bg-neutral-950">
      {/* Left - Form on white */}
      <div className="flex w-full items-center justify-center bg-white px-4 dark:bg-neutral-950 sm:px-8 md:px-16 lg:w-7/12 lg:px-20">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Back to home */}
            <Link
              href="/"
              className="mb-8 inline-flex items-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <span className="mr-2">&larr;</span>
              {t('back')}
            </Link>

            <h1 className="font-[family-name:var(--font-dm-serif-display)] text-3xl font-light leading-tight text-neutral-900 dark:text-white sm:text-4xl">
              {t('title')}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t('subtitle')}
            </p>

            {formState.success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-8 text-center"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                  {t('successTitle')}
                </h3>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {formState.message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="mt-6 rounded-lg border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 dark:border-neutral-800 dark:text-white dark:hover:bg-neutral-900"
                >
                  {t('newMessage')}
                </Button>
              </motion.div>
            ) : (
              <form action={formAction} className="mt-8 flex flex-col gap-5">
                {/* Honeypot */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="name"
                      className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                    >
                      {t('labelName')}
                    </Label>
                    <Input
                      type="text"
                      name="name"
                      id="name"
                      required
                      placeholder={t('placeholderName')}
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                    {formState.errors?.name && (
                      <p className="text-xs text-red-500">{formState.errors.name[0]}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="company"
                      className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                    >
                      {t('labelCompany')}
                    </Label>
                    <Input
                      type="text"
                      name="company"
                      id="company"
                      placeholder={t('placeholderCompany')}
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                  >
                    {t('labelEmail')}
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    id="email"
                    required
                    placeholder={t('placeholderEmail')}
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                  />
                  {formState.errors?.email && (
                    <p className="text-xs text-red-500">{formState.errors.email[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="message"
                    className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                  >
                    {t('labelMessage')}
                  </Label>
                  <Textarea
                    name="message"
                    id="message"
                    rows={3}
                    required
                    placeholder={t('placeholderMessage')}
                    className="w-full resize-none rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-900 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                  />
                  {formState.errors?.message && (
                    <p className="text-xs text-red-500">{formState.errors.message[0]}</p>
                  )}
                </div>

                <SubmitButton />

                <p className="text-center text-[11px] text-neutral-500 dark:text-neutral-400">
                  {t('disclaimer')}
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>

      {/* Right - Dark panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-5/12 items-center py-6 pr-6 pl-3">
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
                {t('demoTitle')}
              </h2>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                {t('demoSubtitle')}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="mt-10 flex flex-col gap-4 w-full max-w-xs"
            >
              {[
                { stat: t('statDemoTime'), label: t('statDemoLabel') },
                { stat: t('statResponseTime'), label: t('statResponseLabel') },
                { stat: t('statTrialTime'), label: t('statTrialLabel') },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-4 text-left">
                  <span className="min-w-max text-2xl font-bold text-white">{item.stat}</span>
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
