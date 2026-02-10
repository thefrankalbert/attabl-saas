'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Layout,
  X,
  Menu,
  Sun,
  Moon,
  Mail,
  Calendar,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useFormState, useFormStatus } from 'react-dom';
import { submitContactForm } from '@/app/actions/contact';
import { motion, AnimatePresence } from 'framer-motion';

// Submit Button Component
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-14 rounded-xl bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold text-lg shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-all"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Envoi en cours...
        </>
      ) : (
        <>
          Demander un Rendez-vous <ArrowRight className="ml-2 h-5 w-5" />
        </>
      )}
    </Button>
  );
}

export default function ContactPage() {
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [formState, formAction] = useFormState(submitContactForm, { success: false, message: '' });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Lock body scroll
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white font-sans selection:bg-[#CCFF00] selection:text-black overflow-x-hidden transition-colors duration-300">
      {/* MOBILE MENU (Consistent with Home) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[999] bg-white dark:bg-black md:hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-white/5">
              <Link href="/" onClick={closeMobileMenu} className="flex items-center gap-2">
                <div className="bg-black dark:bg-transparent rounded-md p-0.5">
                  <Layout className="h-6 w-6 text-[#CCFF00]" />
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                  ATTABL
                </span>
              </Link>
              <button
                className="p-2 text-black dark:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
                onClick={closeMobileMenu}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col h-full">
              <nav className="flex flex-col gap-2 text-2xl font-bold">
                <Link
                  href="/"
                  onClick={closeMobileMenu}
                  className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white"
                >
                  Accueil
                </Link>
                <Link
                  href="/#features"
                  onClick={closeMobileMenu}
                  className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white"
                >
                  Fonctionnalités
                </Link>
                <Link
                  href="/#pricing"
                  onClick={closeMobileMenu}
                  className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white"
                >
                  Tarifs
                </Link>
                <Link
                  href="/contact"
                  onClick={closeMobileMenu}
                  className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-[#CCFF00]"
                >
                  Contact
                </Link>
              </nav>
              <div className="h-px bg-gray-100 dark:bg-white/5 my-6"></div>
              <div className="flex flex-col gap-4 mt-auto pb-8">
                <div className="flex justify-between items-center px-4">
                  <span className="text-lg font-medium text-gray-500 dark:text-gray-400">Mode</span>
                  <button
                    onClick={toggleTheme}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white"
                  >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                </div>
                <div className="h-4"></div>
                <Link href="/login" onClick={closeMobileMenu}>
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-lg h-14 rounded-xl border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white"
                  >
                    Connexion
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className="fixed top-0 z-50 w-full bg-white/80 dark:bg-black/80 backdrop-blur-md py-4 border-b border-gray-100 dark:border-white/5">
        <div className="container mx-auto px-6 max-w-7xl flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-black dark:bg-transparent rounded-md p-0.5">
              <Layout className="h-6 w-6 text-[#CCFF00]" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white group-hover:text-[#a3cc00] dark:group-hover:text-[#CCFF00] transition-colors">
              ATTABL
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Link href="/" className="hover:text-black dark:hover:text-white transition-colors">
              Accueil
            </Link>
            <Link
              href="/#features"
              className="hover:text-black dark:hover:text-white transition-colors"
            >
              Fonctionnalités
            </Link>
            <Link href="/contact" className="text-black dark:text-white font-bold">
              Contact
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <Link href="/login">
              <Button
                variant="ghost"
                className="rounded-full text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 font-semibold"
              >
                Connexion
              </Button>
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-black dark:text-white"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* CONTACT HERO/FORM */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-32 container mx-auto px-6 max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-start">
          {/* Left Column: Text & Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/50 bg-[#CCFF00]/10 text-xs font-bold tracking-wide text-black dark:text-[#CCFF00] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
              </span>
              DISPONIBLE IMMÉDIATEMENT
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-gray-900 dark:text-white mb-6">
              Prendre <br />
              <span className="text-[#CCFF00]">Rendez-vous.</span>
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-12 leading-relaxed max-w-lg">
              Vous souhaitez transformer l&apos;expérience client de votre établissement ? Discutons
              de vos besoins et planifions une démo personnalisée.
            </p>

            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Email
                  </p>
                  <a
                    href="mailto:contact@attabl.com"
                    className="text-lg font-bold text-gray-900 dark:text-white hover:text-[#CCFF00] transition-colors"
                  >
                    contact@attabl.com
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Disponibilité
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    Lun - Ven, 9h - 18h
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-[#CCFF00] to-transparent rounded-3xl opacity-20 blur-lg"></div>

            <div className="relative bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 p-8 md:p-10 rounded-3xl shadow-xl">
              {formState.success ? (
                <div className="text-center py-12">
                  <div className="h-20 w-20 bg-[#CCFF00]/20 rounded-full flex items-center justify-center mx-auto mb-6 text-[#CCFF00]">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Demande Envoyée !
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">{formState.message}</p>
                  <Button
                    variant="outline"
                    className="mt-8"
                    onClick={() => window.location.reload()}
                  >
                    Envoyer un autre message
                  </Button>
                </div>
              ) : (
                <form action={formAction} className="flex flex-col gap-6">
                  {/* Honeypot field — hidden from humans, bots fill it */}
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label
                        htmlFor="name"
                        className="text-sm font-bold text-gray-900 dark:text-white"
                      >
                        Nom complet
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        required
                        placeholder="Jean Dupont"
                        className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#CCFF00] focus:border-transparent focus:outline-none transition-all"
                      />
                      {formState.errors?.name && (
                        <p className="text-red-500 text-xs">{formState.errors.name[0]}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="company"
                        className="text-sm font-bold text-gray-900 dark:text-white"
                      >
                        Établissement
                      </label>
                      <input
                        type="text"
                        name="company"
                        id="company"
                        placeholder="Hôtel Le Plaza"
                        className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#CCFF00] focus:border-transparent focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="text-sm font-bold text-gray-900 dark:text-white"
                    >
                      Email professionnel
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      required
                      placeholder="jean@hotel-plaza.com"
                      className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#CCFF00] focus:border-transparent focus:outline-none transition-all"
                    />
                    {formState.errors?.email && (
                      <p className="text-red-500 text-xs">{formState.errors.email[0]}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="date"
                      className="text-sm font-bold text-gray-900 dark:text-white"
                    >
                      Préférence de date/heure (Optionnel)
                    </label>
                    <input
                      type="text"
                      name="date"
                      id="date"
                      placeholder="Lundi prochain vers 14h..."
                      className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#CCFF00] focus:border-transparent focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="message"
                      className="text-sm font-bold text-gray-900 dark:text-white"
                    >
                      Message / Besoins spécifiques
                    </label>
                    <textarea
                      name="message"
                      id="message"
                      rows={4}
                      required
                      placeholder="Je suis intéressé par..."
                      className="w-full p-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#CCFF00] focus:border-transparent focus:outline-none transition-all resize-none"
                    ></textarea>
                    {formState.errors?.message && (
                      <p className="text-red-500 text-xs">{formState.errors.message[0]}</p>
                    )}
                  </div>

                  <SubmitButton />

                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                    En envoyant ce formulaire, vous acceptez d&apos;être contacté par notre équipe.
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-white dark:bg-black border-t border-gray-100 dark:border-white/5">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="bg-black dark:bg-transparent rounded-md p-0.5">
              <Layout className="h-6 w-6 text-[#CCFF00]" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">ATTABL</span>
          </div>
          <div className="text-sm text-gray-500">© 2026 Attabl Inc.</div>
        </div>
      </footer>
    </div>
  );
}
