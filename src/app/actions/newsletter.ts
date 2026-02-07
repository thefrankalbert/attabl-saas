'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
});

export async function subscribeToNewsletter(prevState: any, formData: FormData) {
    const email = formData.get('email');

    // Validate email
    const validatedFields = schema.safeParse({ email });

    if (!validatedFields.success) {
        return {
            success: false,
            message: validatedFields.error.flatten().fieldErrors.email?.[0] || "Invalid email",
        };
    }

    const supabase = await createClient(); // Use createClient (admin client preferable for checking uniqueness if RLS prevents select, but insert constraints handle unique violation)

    try {
        const { error } = await supabase
            .from('newsletter_subscriber')
            .insert({ email: validatedFields.data.email });

        if (error) {
            if (error.code === '23505') { // Unique violation
                return {
                    success: false,
                    message: "You are already subscribed!",
                };
            }
            console.error('Newsletter error:', error);
            return {
                success: false,
                message: "Something went wrong. Please try again.",
            };
        }

        return {
            success: true,
            message: "Thank you for subscribing!",
        };
    } catch (error) {
        console.error('Newsletter error:', error);
        return {
            success: false,
            message: "Something went wrong. Please try again.",
        };
    }
}
