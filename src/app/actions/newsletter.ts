'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { newsletterLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

export async function subscribeToNewsletter(
  prevState: { success: boolean; message: string } | null,
  formData: FormData,
) {
  // Rate limiting
  const headersList = await headers();
  const ip = getClientIpFromHeaders(headersList);
  const { success: allowed } = await newsletterLimiter.check(ip);
  if (!allowed) {
    return { success: false, message: 'Too many requests. Please try again later.' };
  }

  const email = formData.get('email');

  // Validate email
  const validatedFields = schema.safeParse({ email });

  if (!validatedFields.success) {
    return {
      success: false,
      message: validatedFields.error.flatten().fieldErrors.email?.[0] || 'Invalid email',
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
          message: 'Thank you for subscribing!',
        };
      }
      logger.error('Newsletter subscription error', error);
      return {
        success: false,
        message: 'Something went wrong. Please try again.',
      };
    }

    return {
      success: true,
      message: 'Thank you for subscribing!',
    };
  } catch (error) {
    logger.error('Newsletter subscription error', error);
    return {
      success: false,
      message: 'Something went wrong. Please try again.',
    };
  }
}
