'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { contactLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';

const contactSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  company: z.string().optional(),
  date: z.string().optional(),
  message: z.string().min(10, 'Le message doit contenir au moins 10 caractères'),
});

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

export async function submitContactForm(prevState: ContactState, formData: FormData) {
  // Rate limiting
  const headersList = await headers();
  const ip = getClientIpFromHeaders(headersList);
  const { success: allowed } = await contactLimiter.check(ip);
  if (!allowed) {
    return { success: false, message: 'Trop de requêtes. Réessayez plus tard.' };
  }

  // Honeypot check — bots fill this hidden field, humans don't
  const honeypot = formData.get('website');
  if (honeypot) {
    // Silently accept to avoid revealing the trap
    logger.info('Honeypot triggered — bot submission blocked');
    return {
      success: true,
      message: 'Votre demande de rendez-vous a été envoyée !',
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
      message: 'Erreur de validation. Vérifiez les champs.',
      success: false,
    };
  }

  const { name, email, company, date, message } = validatedFields.data;

  // TODO: Integration with Email Provider (Resend, Nodemailer, etc.)
  // In production, use: await resend.emails.send({ ... })

  logger.info('New appointment request', {
    from: `${name} (${email})`,
    company,
    preferredDate: date,
    messageLength: message.length,
  });

  logger.warn('Contact form submission received but email sending is not configured', {
    name,
    email,
  });

  return {
    success: true,
    message: 'Votre demande a été enregistrée. Notre équipe vous contactera bientôt.',
  };
}
