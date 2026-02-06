'use server'

import { z } from 'zod';

const contactSchema = z.object({
    name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    email: z.string().email("Email invalide"),
    company: z.string().optional(),
    date: z.string().optional(),
    message: z.string().min(10, "Le message doit contenir au moins 10 caractères"),
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

    // HERE: Integration with Email Provider (Resend, Nodemailer, etc.)
    // For now, we simulate a successful email sending.
    // In production, use: await resend.emails.send({ ... })

    console.log('--- NEW APPOINTMENT REQUEST ---');
    console.log(`From: ${name} (${email})`);
    console.log(`Company: ${company}`);
    console.log(`Preferred Date: ${date}`);
    console.log(`Message: ${message}`);
    console.log('-------------------------------');

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        success: true,
        message: 'Votre demande de rendez-vous a été envoyée ! Un expert vous contactera sous 24h.',
    };
}
