'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { SupportContact } from '@/lib/support-contact';

const SUPPORT_EMAIL = 'support@attabl.com';

interface SupportContactCardProps {
  /** null tant qu'aucun numero n'est enregistre dans la console plateforme. */
  contact: SupportContact | null;
  whatsappHref: string | null;
  phoneHref: string | null;
}

/**
 * L'aide humaine, en premier. WhatsApp ne s'ouvre que si l'application est
 * installee (souvent pas sur une tablette de caisse): le numero reste donc
 * visible et copiable, et l'e-mail est toujours propose.
 */
export function SupportContactCard({ contact, whatsappHref, phoneHref }: SupportContactCardProps) {
  const t = useTranslations('adminSupport');

  const copyNumber = async () => {
    if (!contact) return;
    try {
      await navigator.clipboard.writeText(contact.display);
      toast.success(t('numberCopied'));
    } catch {
      toast.error(t('copyFailed', { phone: contact.display }));
    }
  };

  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-app-text">{t('contactTitle')}</h2>
      <p className="mt-1.5 text-sm text-app-text-secondary">
        {contact ? t('contactBodyPhone', { phone: contact.display }) : t('contactBodyEmail')}
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {whatsappHref && (
          <Button asChild className="h-11 rounded-xl px-5 font-semibold">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              {t('whatsappCta')}
            </a>
          </Button>
        )}
        {contact && (
          <Button
            variant="outline"
            onClick={copyNumber}
            className="h-11 rounded-xl px-5 font-semibold"
          >
            {t('copyNumber')}
          </Button>
        )}
        {phoneHref && (
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-xl px-5 font-semibold sm:hidden"
          >
            <a href={phoneHref}>{t('callCta')}</a>
          </Button>
        )}
        <Button
          asChild
          variant={contact ? 'ghost' : 'default'}
          className="h-11 rounded-xl px-5 font-semibold"
        >
          <a href={`mailto:${SUPPORT_EMAIL}`}>{t('emailCta')}</a>
        </Button>
      </div>

      {contact && (
        <p className="mt-4 text-xs leading-relaxed text-app-text-muted">{t('noWhatsappHint')}</p>
      )}
    </section>
  );
}
