import { getTranslations } from 'next-intl/server';
import { SupportContactCard } from '@/components/admin/support/SupportContactCard';
import { SupportGuides } from '@/components/admin/support/SupportGuides';
import { SupportFAQ } from '@/components/admin/support/SupportFAQ';
import { getTenant } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { supportPhoneLink, supportWhatsAppLink } from '@/lib/support-contact';
import { loadSupportContact } from '@/services/platform-settings.service';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navSupport');
}

export default async function SupportPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const t = await getTranslations('adminSupport');
  const [tenant, contact] = await Promise.all([
    getTenant(site),
    createClient().then(loadSupportContact),
  ]);
  const whatsapp = contact
    ? supportWhatsAppLink(contact, t('whatsappMessage', { restaurant: tenant?.name ?? site }))
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-app-text sm:text-2xl">
          {t('heading')}
        </h1>
        <p className="mt-1.5 text-sm text-app-text-secondary">{t('intro')}</p>
      </header>

      <SupportContactCard
        contact={contact}
        whatsappHref={whatsapp}
        phoneHref={contact ? supportPhoneLink(contact) : null}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-app-text">{t('guidesTitle')}</h2>
        <div className="rounded-2xl border border-app-border bg-app-card">
          <SupportGuides basePath={`/sites/${site}/admin`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-app-text">{t('faqTitle')}</h2>
        <div className="rounded-2xl border border-app-border bg-app-card">
          <SupportFAQ />
        </div>
      </section>
    </div>
  );
}
