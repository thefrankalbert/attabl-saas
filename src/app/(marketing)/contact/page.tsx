'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Loader2, Mail, MapPin, MessageCircle } from 'lucide-react';
import { actionSubmitContactForm } from '@/app/actions/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { BlurFade } from '@/components/ui/blur-fade';

const WHATSAPP = 'https://wa.me/22665565411';
const CITY_KEYS = ['yaounde', 'ouaga', 'ndjamena'] as const;
const CITY_TEL: Record<(typeof CITY_KEYS)[number], string> = {
  yaounde: '+237658651050',
  ouaga: '+22665565411',
  ndjamena: '+23564940372',
};
const FAQ_KEYS = ['q1', 'q2', 'q3'] as const;

const FIELD =
  'h-11 rounded-xl border-zinc-200 bg-white text-base text-zinc-950 focus-visible:border-zinc-400 focus-visible:ring-0 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50';
const LABEL = 'text-xs font-semibold text-zinc-500 dark:text-zinc-400';

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('contact');
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-auto self-start rounded-[10px] bg-zinc-900 px-6 py-3 text-[15px] font-semibold text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('submitting')}
        </span>
      ) : (
        <span className="flex items-center gap-2">
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
    <>
      {/* Hero */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[780px] px-5 pt-20 text-center sm:px-7 sm:pt-[84px]">
          <BlurFade offset={18} blur="0px" duration={0.7}>
            <span className="text-[13px] font-semibold uppercase tracking-[0.02em] text-zinc-500 dark:text-zinc-400">
              {t('eyebrow')}
            </span>
            <h1 className="mt-3.5 text-[40px] font-semibold leading-[1.03] tracking-[-0.035em] text-zinc-950 lg:text-[54px] dark:text-zinc-50">
              {t('heroTitle')}
            </h1>
            <p className="mx-auto mt-5 max-w-[520px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
              {t('heroSubtitle')}
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Form + channels */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-start gap-10 px-5 pb-[110px] pt-14 sm:px-7 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          {/* Form card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-[0_30px_60px_-40px_rgba(9,9,11,0.18)] dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
              {t('formTitle')}
            </h2>
            <p className="mt-2 text-[14.5px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('formSubtitle')}
            </p>

            {formState.success ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-full border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
                  <Check
                    className="h-[26px] w-[26px] text-green-600 dark:text-green-500"
                    strokeWidth={2}
                  />
                </div>
                <h3 className="mt-[18px] text-xl font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                  {t('successTitle')}
                </h3>
                <p className="mx-auto mt-2 max-w-[340px] text-[14.5px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
                  {formState.message}
                </p>
                <a
                  href={WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t('chWhatsappCta')}
                </a>
              </div>
            ) : (
              <form action={formAction} className="mt-6 flex flex-col gap-[18px]">
                {/* Honeypot: zero-size clipped (never -left-[9999px] inside a scroll container) */}
                <div className="h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
                  {/* eslint-disable-next-line react/forbid-elements -- honeypot: native input to stay invisible to bots */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                <div className="grid gap-[18px] sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className={LABEL}>
                      {t('labelName')}
                    </Label>
                    <Input
                      type="text"
                      name="name"
                      id="name"
                      required
                      placeholder={t('placeholderName')}
                      className={FIELD}
                    />
                    {formState.errors?.name && (
                      <p className="text-xs text-red-500">{formState.errors.name[0]}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company" className={LABEL}>
                      {t('labelCompany')}
                    </Label>
                    <Input
                      type="text"
                      name="company"
                      id="company"
                      placeholder={t('placeholderCompany')}
                      className={FIELD}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className={LABEL}>
                    {t('labelEmail')}
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    id="email"
                    required
                    placeholder={t('placeholderEmail')}
                    className={FIELD}
                  />
                  {formState.errors?.email && (
                    <p className="text-xs text-red-500">{formState.errors.email[0]}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="message" className={LABEL}>
                    {t('labelMessage')}
                  </Label>
                  <Textarea
                    name="message"
                    id="message"
                    rows={4}
                    required
                    placeholder={t('placeholderMessage')}
                    className="min-h-[110px] resize-y rounded-xl border-zinc-200 bg-white text-base text-zinc-950 focus-visible:border-zinc-400 focus-visible:ring-0 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  {formState.errors?.message && (
                    <p className="text-xs text-red-500">{formState.errors.message[0]}</p>
                  )}
                </div>
                <SubmitButton />
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{t('formNote')}</p>
              </form>
            )}
          </div>

          {/* Channels */}
          <div className="flex flex-col gap-3.5">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3.5 rounded-[14px] border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
                <MessageCircle
                  className="h-5 w-5 text-green-600 dark:text-green-500"
                  strokeWidth={2}
                />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
                  {t('chWhatsapp')}
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                  {t('chWhatsappDesc')}
                </span>
              </span>
            </a>
            <a
              href="mailto:contact@attabl.com"
              className="flex items-start gap-3.5 rounded-[14px] border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                <Mail className="h-5 w-5 text-zinc-900 dark:text-zinc-100" strokeWidth={2} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
                  {t('chEmail')}
                </span>
                <span className="mt-0.5 block text-[13.5px] text-zinc-500 dark:text-zinc-400">
                  contact@attabl.com
                </span>
              </span>
            </a>
            <div className="rounded-[14px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-2.5">
                <MapPin
                  className="h-[18px] w-[18px] text-zinc-900 dark:text-zinc-100"
                  strokeWidth={2}
                />
                <span className="text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
                  {t('chOffices')}
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-3.5">
                {CITY_KEYS.map((c) => (
                  <a key={c} href={`tel:${CITY_TEL[c]}`} className="block">
                    <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {t(`cities.${c}.name`)}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] text-zinc-500 dark:text-zinc-400">
                      {t(`cities.${c}.phone`)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] bg-zinc-950 p-5 dark:bg-zinc-900">
              <div className="text-sm font-semibold text-white">{t('chDemoTitle')}</div>
              <p className="mb-3.5 mt-1.5 text-[13.5px] leading-[1.5] text-zinc-400">
                {t('chDemoSub')}
              </p>
              <a
                href="/signup"
                className="inline-block rounded-lg bg-white px-4 py-2 text-[13.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                {t('chDemoCta')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Cities */}
      <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-center gap-10 px-5 py-[84px] sm:px-7 lg:grid-cols-2 lg:gap-12">
          <BlurFade inView offset={20} blur="0px" duration={0.7}>
            <h2 className="text-[32px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('citiesTitle')}
            </h2>
            <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('citiesSubtitle')}
            </p>
          </BlurFade>
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="flex flex-col gap-3">
            {CITY_KEYS.map((c) => (
              <div
                key={c}
                className="flex items-center gap-3.5 rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full bg-orange-500" />
                <div>
                  <div className="text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
                    {t(`cities.${c}.name`)}{' '}
                    <span className="font-normal text-zinc-500 dark:text-zinc-400">
                      - {t(`cities.${c}.country`)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {t(`cities.${c}.phone`)}
                  </div>
                </div>
              </div>
            ))}
          </BlurFade>
        </div>
      </section>

      {/* Mini FAQ */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[740px] px-5 py-[88px] sm:px-7">
          <h2 className="mb-9 text-center text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('faqTitle')}
          </h2>
          <Accordion type="single" collapsible className="flex flex-col gap-2.5">
            {FAQ_KEYS.map((k) => (
              <AccordionItem
                key={k}
                value={k}
                className="overflow-hidden rounded-[14px] border border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <AccordionTrigger className="py-5 text-left text-[16px] font-medium tracking-[-0.01em] text-zinc-950 hover:no-underline dark:text-zinc-50">
                  {t(`faq.${k}.q`)}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`faq.${k}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}
