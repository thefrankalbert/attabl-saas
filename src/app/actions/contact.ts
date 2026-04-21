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

  const validatedFields = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    company: formData.get('company'),
    date: formData.get('date'),
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

  if (!emailSent) {
    logger.warn('Contact form email could not be sent', {
      nameLength: name.length,
      emailHash: hashEmail(email),
    });
  }

  return {
    success: true,
    message: t('contactSuccess'),
  };
}
