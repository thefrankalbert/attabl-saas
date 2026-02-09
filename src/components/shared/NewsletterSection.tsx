'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { subscribeToNewsletter } from '@/app/actions/newsletter';

interface NewsletterSectionProps {
  primaryColor?: string;
  logoUrl?: string;
  lang?: 'fr' | 'en';
}

const translations = {
  fr: {
    title: 'Restez à la pointe',
    subtitle: "de l'hospitalité",
    description:
      'Recevez nos conseils pour optimiser votre établissement et offrir une expérience client exceptionnelle.',
    placeholder: 'Votre email',
    button: "S'abonner",
    disclaimer: 'Pas de spam, promis.',
    success: 'Merci de votre inscription !',
    error: 'Une erreur est survenue.',
    invalid: 'Email invalide.',
  },
  en: {
    title: 'Stay ahead in',
    subtitle: 'hospitality',
    description:
      'Get tips to optimize your establishment and deliver an exceptional guest experience.',
    placeholder: 'Your email',
    button: 'Subscribe',
    disclaimer: 'No spam, we promise.',
    success: 'Thank you for subscribing!',
    error: 'Something went wrong.',
    invalid: 'Invalid email.',
  },
};

export default function NewsletterSection({
  primaryColor = '#CCFF00', // Attabl Neon Green
  logoUrl,
  lang = 'fr',
}: NewsletterSectionProps) {
  const t = translations[lang];
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error(t.invalid);
      return;
    }

    const formData = new FormData();
    formData.append('email', email);

    startTransition(async () => {
      const result = await subscribeToNewsletter(null, formData);

      if (result.success) {
        toast.success(t.success);
        setEmail('');
      } else {
        // If message is "You are already subscribed!", we might want to translate that too ideally,
        // but for now we show backend message or generic error.
        // A better way would be returning error codes.
        // For simplicity, we show the message from server if it's safe or fallback.
        toast.error(result.message || t.error);
      }
    });
  };

  return (
    <section className="w-full bg-gray-50 dark:bg-[#0a0a0a] py-16 px-4 md:px-8 border-t border-gray-200 dark:border-gray-800 transition-colors duration-300">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 relative">
          {/* Left side: Text */}
          <div className="w-full lg:w-1/2 space-y-6 relative z-10">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="h-10 w-10 relative bg-white dark:bg-white/10 rounded-lg p-1 overflow-hidden shadow-none">
                  <Image src={logoUrl} alt="Logo" fill className="object-contain" />
                </div>
              ) : (
                // Default Attabl Branding - Text Only (No Icon)
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                  ATTABL
                </span>
              )}
            </div>
            <h2 className="text-4xl md:text-5xl font-serif text-gray-900 dark:text-white leading-[1.1]">
              {t.title} <br />
              <span className="italic font-light text-gray-500 dark:text-gray-300">
                {t.subtitle}
              </span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base max-w-md leading-relaxed">
              {t.description}
            </p>
          </div>

          {/* Right side: Form */}
          <div className="w-full lg:w-1/2 flex flex-col gap-4 relative z-10 lg:pl-12">
            {/* Input group */}
            <form
              onSubmit={handleSubmit}
              className="flex w-full items-center p-1.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 focus-within:border-[#CCFF00] dark:focus-within:border-[#CCFF00] transition-all shadow-none"
            >
              <Input
                type="email"
                placeholder={t.placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-transparent border-none text-gray-900 dark:text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 h-10 md:h-12 flex-grow shadow-none"
                disabled={isPending}
              />
              <Button
                type="submit"
                className="h-10 md:h-12 px-6 md:px-8 rounded-lg font-bold text-white dark:text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-none focus-visible:ring-0"
                style={{ backgroundColor: primaryColor }}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.button}
              </Button>
            </form>
            <p className="text-xs text-gray-500 dark:text-gray-600 pl-2">{t.disclaimer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
