'use server';

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { newsletterLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
import { newsletterSchema } from '@/lib/validations/newsletter.schema';
import { getTranslations } from 'next-intl/server';

export async function actionSubscribeToNewsletter(
  prevState: { success: boolean; message: string } | null,
  formData: FormData,
) {
  const t = await getTranslations('errors');

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIpFromHeaders(headersList);
  const { success: allowed } = await newsletterLimiter.check(ip);
  if (!allowed) {
    return { success: false, message: t('rateLimited') };
  }

  const email = formData.get('email');

  // Validate email
  const validatedFields = newsletterSchema.safeParse({ email });

  if (!validatedFields.success) {
    return {
      success: false,
      message: validatedFields.error.flatten().fieldErrors.email?.[0] || t('invalidEmail'),
    };
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('newsletter_subscriber')
      .insert({ email: validatedFields.data.email });

    if (error) {
      if (error.code === '23505') {
        // SECURITY: Same success message whether already subscribed or not
        // Prevents email enumeration attacks
        return {
          success: true,
          message: t('newsletterSuccess'),
        };
      }
      logger.error('Newsletter subscription error', error);
      return {
        success: false,
        message: t('newsletterError'),
      };
    }

    return {
      success: true,
      message: t('newsletterSuccess'),
    };
  } catch (error) {
    logger.error('Newsletter subscription error', error);
    return {
      success: false,
      message: t('newsletterError'),
    };
  }
}
