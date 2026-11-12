'use server';

import { headers } from 'next/headers';
import { logger, hashEmail } from '@/lib/logger';
import { contactLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
import { contactSchema } from '@/lib/validations/contact.schema';
import { sendContactFormEmail } from '@/services/email.service';
import { getTranslations } from 'next-intl/server';

export type ContactState = {
  errors?: {
    name?: string[];
    email?: string[];
    company?: string[];
    date?: string[];
    message?: string[];
  };
  message?: string;
  success?: boolean;
};

export async function actionSubmitContactForm(prevState: ContactState, formData: FormData) {
  const t = await getTranslations('errors');

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIpFromHeaders(headersList);
  const { success: allowed } = await contactLimiter.check(ip);
  if (!allowed) {
    return { success: false, message: t('rateLimited') };
  }

  // Honeypot check - bots fill this hidden field, humans don't
  const honeypot = formData.get('website');
  if (honeypot) {
    // Silently accept to avoid revealing the trap
    logger.info('Honeypot triggered - bot submission blocked');
    return {
      success: true,
      message: t('contactSuccessHoneypot'),
    };
  }

  // Un champ absent du formulaire revient `null` de FormData, et Zod refuse
  // `null` pour un champ optionnel (il attend une chaine ou `undefined`). La
  // refonte de la vitrine a retire le champ `date` du formulaire: chaque envoi
  // etait alors refuse sur ce champ, sans endroit ou afficher l'erreur. On
  // traduit donc "absent" en `undefined`.
  const champOptionnel = (cle: string): string | undefined => {
    const valeur = formData.get(cle);
    return typeof valeur === 'string' && valeur.trim() ? valeur : undefined;
  };

  const validatedFields = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    company: champOptionnel('company'),
    date: champOptionnel('date'),
    message: formData.get('message'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: t('validationError'),
      success: false,
    };
  }

  const { name, email, company, date, message } = validatedFields.data;

  logger.info('New appointment request', {
    nameLength: name.length,
    emailHash: hashEmail(email),
    company,
    preferredDate: date,
    messageLength: message.length,
  });

  const emailSent = await sendContactFormEmail({ name, email, company, date, message });

  // Le message n'est stocke nulle part ailleurs: si le courriel ne part pas,
  // il est perdu. Annoncer un succes ferait croire au visiteur qu'on va le
  // rappeler. On lui dit la verite et on lui laisse les autres canaux.
  if (!emailSent) {
    logger.error('Contact form email could not be sent', undefined, {
      nameLength: name.length,
      emailHash: hashEmail(email),
    });
    return { success: false, message: t('contactSendFailed') };
  }

  return {
    success: true,
    message: t('contactSuccess'),
  };
}
