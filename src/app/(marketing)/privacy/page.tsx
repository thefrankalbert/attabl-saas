import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { COMPANY, PRIVACY_EMAIL, filledCompanyFields } from '@/lib/legal/company';
import { RETENTION, daysToMonths } from '@/lib/legal/retention';

const PROCESSOR_IDS = [
  'supabase',
  'vercel',
  'resend',
  'sentry',
  'upstash',
  'cloudflare',
  'stripe',
  'google',
  'github',
  'push',
  'anthropic',
  'exchangerate',
  'flutterwave',
] as const;

const COOKIE_KEYS = [
  'cookieAuth',
  'cookieLocale',
  'cookieRecovery',
  'cookieCc',
  'cookieStorage',
  'cookieSentry',
] as const;

const COMPANY_LABEL_KEYS = {
  legalName: 'companyLegalName',
  legalForm: 'companyLegalForm',
  rccm: 'companyRccm',
  niu: 'companyNiu',
  headOffice: 'companyHeadOffice',
  burkinaAddress: 'companyBurkinaAddress',
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.privacy');
  return {
    alternates: { canonical: '/privacy' },
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
        {title}
      </h2>
      {children}
    </>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">{children}</p>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function PrivacyPage() {
  const t = await getTranslations('marketing.privacy');
  const companyFields = filledCompanyFields(COMPANY);

  const retention = [
    t('retentionAccount'),
    t('retentionGuests', { days: RETENTION.guestDataDays }),
    t('retentionSessions', { days: RETENTION.sessionsDays }),
    t('retentionInvitations', { days: RETENTION.invitationsAfterExpiryDays }),
    t('retentionPush', { days: RETENTION.pushInactiveDays }),
    t('retentionAudit', { months: daysToMonths(RETENTION.auditLogDays) }),
    t('retentionClosed', { days: RETENTION.closedTenantAnonymizeDays }),
    t('retentionAccounting'),
    t('retentionBackups', { days: RETENTION.backupDays }),
    t('retentionContact', { months: daysToMonths(RETENTION.contactMailDays) }),
  ];

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[760px] px-5 pb-24 pt-20 sm:px-7 sm:pt-[88px]">
        <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
          {t('heading')}
        </h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{t('lastUpdate')}</p>

        <Section title={t('section1Title')}>
          <Body>{t('section1Body')}</Body>
          {companyFields.length > 0 && (
            <dl className="mt-4 space-y-1 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
              {companyFields.map(({ key, value }) => (
                <div key={key} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-zinc-950 dark:text-zinc-50">
                    {t(COMPANY_LABEL_KEYS[key])}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        <Section title={t('section2Title')}>
          <Body>{t('section2Body')}</Body>
        </Section>

        <Section title={t('section3Title')}>
          <Body>{t('section3Body')}</Body>
        </Section>

        <Section title={t('section4Title')}>
          <Body>{t('section4Intro')}</Body>
          <ul className="mt-3 space-y-3">
            {PROCESSOR_IDS.map((id) => (
              <li
                key={id}
                className="rounded-lg border border-zinc-200 p-4 text-base leading-[1.5] dark:border-zinc-800"
              >
                <p className="font-medium text-zinc-950 dark:text-zinc-50">
                  {t(`processors.${id}.name`)}
                </p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {t(`processors.${id}.role`, { days: RETENTION.backupDays })}
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {t(`processors.${id}.country`)}
                </p>
              </li>
            ))}
          </ul>
          <Body>{t('section4Transfers')}</Body>
        </Section>

        <Section title={t('section5Title')}>
          <Body>{t('section5Body')}</Body>
        </Section>

        <Section title={t('section6Title')}>
          <Body>
            {t('section6Body')}{' '}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="font-medium text-orange-700 hover:underline dark:text-orange-400"
            >
              {PRIVACY_EMAIL}
            </a>
            .
          </Body>
        </Section>

        <Section title={t('section7Title')}>
          <Body>{t('section7Intro')}</Body>
          <Bullets items={COOKIE_KEYS.map((key) => t(key))} />
        </Section>

        <Section title={t('section8Title')}>
          <Body>{t('section8Intro')}</Body>
          <Bullets items={retention} />
        </Section>

        <Section title={t('section9Title')}>
          <Body>{t('section9Body')}</Body>
        </Section>
      </div>
    </section>
  );
}
