"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Menu,
  X,
  Smartphone,
  Layout,
  CreditCard,
  ArrowRight,
  Star as StarIcon,
  ShieldCheck,
  Users,
  Moon,
  Sun,
  Quote,
  Globe,
  Hexagon,
  Triangle,
  Circle,
  Square,
  Award
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { PricingCard, PricingPlan, BillingInterval } from '@/components/shared/PricingCard';
import NewsletterSection from '@/components/shared/NewsletterSection';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants, Easing } from 'framer-motion';
import { useTheme } from "next-themes";

// Translations
const translations = {
  fr: {
    nav: {
      features: "Fonctionnalités",
      pricing: "Tarifs",
      about: "À propos",
      contact: "Contact",
      login: "Connexion",
      signup: "S'inscrire"
    },
    hero: {
      pill_prefix: "Nouveau :",
      pills: [
        "Service en Chambre Intuitif",
        "Paiement QR Code Instantané",
        "Gestion de Stock IA"
      ],
      title_line1: "ATTABL",
      title_line2: "commander",
      title_highlight: "mieux",
      subtitle: "Offrez à vos clients la liberté de commander mieux. Attabl réinvente la gestion de votre table pour que vous puissiez vous concentrer sur l'essentiel : l'art de recevoir.",
      email_placeholder: "Adresse e-mail professionnelle",
      cta_primary: "Essai gratuit",
      cta_desc: "Aucune carte requise",
      users_active: "hôtels de luxe",
      partners_line1: "d'expertise",
      partners_line2: "au service des clients"
    },
    features: {
      security: { title: "Sécurité Garantie", desc: "Paiements chiffrés et données protégées. Vos clients commandent en toute sérénité." }, // Accent fixed, better wording
      allinone: { title: "Tout-en-un", desc: "Menu, commande, paiement, KDS. Une seule application pour tout piloter." },
      privacy: { title: "Confidentialité", desc: "Nous ne commercialisons pas les données de vos clients. Vos informations vous appartiennent." }
    },
    pricing: {
      title: "Tarification Simple",
      monthly: "Mensuel",
      yearly: "Annuel",
      cards: {
        essentiel: { name: "Essentiel", desc: "Pour démarrer", cta: "Commencer gratuitement" },
        premium: { name: "Prime", desc: "Le plus populaire", cta: "Passer au plan Prime" },
        enterprise: { name: "Entreprise", desc: "Pour les grands comptes", price: "Sur mesure", cta: "Nous contacter" }
      }
    },
    testimonials: {
      title: "Ce que disent nos partenaires",
      subtitle: "Découvrez comment ils ont transformé leur gestion quotidienne.",
      reviews: [
        { text: "Je l'utilise au quotidien, c'est le véritable centre de pilotage de mon activité.", author: "Thomas R.", role: "Manager" },
        { text: "Interface épurée, fonctionnalités puissantes, l'essentiel est là. 10/10.", author: "Sarah L.", role: "Directrice" },
        { text: "La facturation est devenue un jeu d'enfant...", author: "Marc D.", role: "Freelance" },
        { text: "J'ai enfin trouvé l'outil parfaitement adapté à mes processus.", author: "Julie M.", role: "Consultante" },
        { text: "Le suivi client et les relances n'ont jamais été aussi fluides.", author: "Alex B.", role: "Restaurateur" },
        { text: "J'ai arrêté de jongler avec 4 applications... Tout est centralisé ici.", author: "Sophie K.", role: "Gérante" }
      ]
    },
    footer: {
      rights: "© 2026 Attabl Inc."
    }
  },
  en: {
    nav: {
      features: "Features",
      pricing: "Pricing",
      about: "About",
      contact: "Contact",
      login: "Login",
      signup: "Sign Up"
    },
    hero: {
      pill_prefix: "New:",
      pills: [
        "Intuitive Room Service",
        "Instant QR Code Payment",
        "AI Inventory Management"
      ],
      title_line1: "ATTABL",
      title_line2: "Order",
      title_highlight: "Better",
      subtitle: "Transform the ordering experience within your establishment. From quick menu selection to billing, Attabl provides a turnkey solution.",
      email_placeholder: "Enter work email",
      cta_primary: "Free Trial",
      cta_desc: "No credit card required",
      users_active: "luxury hotels",
      partners_line1: "of expertise",
      partners_line2: "serving clients"
    },
    features: {
      security: { title: "Guaranteed Security", desc: "Encrypted payments and protected data. Your customers order with confidence." },
      allinone: { title: "All-in-One", desc: "Menu, ordering, payment, KDS. One app to manage everything." },
      privacy: { title: "Privacy First", desc: "We don't sell your customer data. Your info stays yours." }
    },
    pricing: {
      title: "Simple Pricing",
      monthly: "Monthly",
      yearly: "Yearly",
      cards: {
        essentiel: { name: "Essential", desc: "To get started", cta: "Start for Free" },
        premium: { name: "Prime", desc: "Most Popular", cta: "Upgrade to Prime" },
        enterprise: { name: "Enterprise", desc: "For large groups.", price: "Custom", cta: "Contact Us" }
      }
    },
    testimonials: {
      title: "Trusted by industry leaders",
      subtitle: "See how others are transforming the way they manage clients.",
      reviews: [
        { text: "I use it every day, it's like my business command center.", author: "Thomas R.", role: "Manager" },
        { text: "Clean UI, powerful features, and no clutter. 10/10.", author: "Sarah L.", role: "Director" },
        { text: "Invoices are so easy now...", author: "Marc D.", role: "Freelance" },
        { text: "Finally found a tool that fits my freelance workflow perfectly.", author: "Julie M.", role: "Consultant" },
        { text: "Client tracking and payment follow-ups have never been this smooth.", author: "Alex B.", role: "Restaurateur" },
        { text: "I stopped juggling 4 apps... Everything is here.", author: "Sophie K.", role: "Manager" }
      ]
    },
    footer: {
      rights: "© 2026 Attabl Inc."
    }
  }
};

const LOGOS = [
  { name: "Grand Luxe", icon: StarIcon },
  { name: "Royal Palace", icon: Award },
  { name: "Ocean Resort", icon: Sun },
  { name: "Urban Suites", icon: Layout },
  { name: "Mountain View", icon: Triangle },
  { name: "Sapphire Hotel", icon: Hexagon },
  { name: "Emerald Bay", icon: Circle },
  { name: "Golden Plaza", icon: Square },
];

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [pillIndex, setPillIndex] = useState(0);
  const [heroEmail, setHeroEmail] = useState('');

  // Auto-detect language
  useEffect(() => {
    const userLang = typeof navigator !== "undefined" ? (navigator.language || (navigator as { readonly languages?: readonly string[] }).languages?.[0] || "") : "";
    const detectedLang = (userLang || "").startsWith('en') ? 'en' : 'fr';

    const frame = requestAnimationFrame(() => {
      setMounted(true);
      setLang(detectedLang);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Badge Text Rotation Interval
  useEffect(() => {
    const interval = setInterval(() => {
      setPillIndex((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const t = translations[lang];

  const handlePlanSelect = async (plan: PricingPlan, interval: BillingInterval) => {
    const emailParam = heroEmail ? `&email=${encodeURIComponent(heroEmail)}` : '';
    router.push(`/signup?plan=${plan}&interval=${interval}${emailParam}`);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const toggleLang = () => {
    setLang(lang === 'fr' ? 'en' : 'fr');
  }

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Animation Variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" as Easing }
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-black text-gray-900 dark:text-white font-sans selection:bg-[#CCFF00] selection:text-black overflow-x-hidden relative">
      {/* Global Top-Left Halo - Increased Opacity */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#CCFF00]/20 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* MOBILE MENU */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[999] bg-white dark:bg-black md:hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-white/5">
              <Link href="/" onClick={closeMobileMenu} className="flex items-center gap-2 active:scale-95 transition-transform">
                <div className="bg-black dark:bg-transparent rounded-md p-0.5">
                  <Layout className="h-6 w-6 text-[#CCFF00]" />
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">ATTABL</span>
              </Link>
              <button className="p-2 text-black dark:text-white active:bg-gray-100 dark:active:bg-white/5 rounded-full transition-colors" onClick={closeMobileMenu}>
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col h-full">
              <nav className="flex flex-col gap-2 text-2xl font-bold">
                <Link href="#features" onClick={closeMobileMenu} className="p-4 rounded-xl active:bg-gray-100 dark:active:bg-white/10 transition-colors">{t.nav.features}</Link>
                <Link href="#pricing" onClick={closeMobileMenu} className="p-4 rounded-xl active:bg-gray-100 dark:active:bg-white/10 transition-colors">{t.nav.pricing}</Link>
                <Link href="#about" onClick={closeMobileMenu} className="p-4 rounded-xl active:bg-gray-100 dark:active:bg-white/10 transition-colors">{t.nav.about}</Link>
                <Link href="/contact" onClick={closeMobileMenu} className="p-4 rounded-xl active:bg-gray-100 dark:active:bg-white/10 transition-colors">{t.nav.contact}</Link>
              </nav>
              <div className="h-px bg-gray-100 dark:bg-white/5 my-6"></div>
              <div className="flex flex-col gap-4 mt-auto pb-8">
                <div className="flex gap-4 px-4">
                  <button onClick={toggleLang} className="h-10 px-4 rounded-full bg-gray-100 dark:bg-white/10 font-bold text-sm active:scale-95 transition-transform">
                    {lang === 'fr' ? 'EN' : 'FR'}
                  </button>
                  <button onClick={toggleTheme} className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 active:scale-95 transition-transform">
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                </div>
                <Link href="/login" onClick={closeMobileMenu}>
                  <Button variant="ghost" className="w-full text-lg h-14 active:scale-[0.98]">{t.nav.login}</Button>
                </Link>
                <Link href="/signup" onClick={closeMobileMenu}>
                  <Button className="w-full text-lg h-14 bg-[#CCFF00] text-black font-bold active:scale-[0.98]">{t.nav.signup}</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className={`fixed top-0 z-50 w-full transition-all duration-300 ${isScrolled ? 'bg-white/90 dark:bg-black/90 backdrop-blur-md py-4 border-b border-gray-100 dark:border-white/5' : 'bg-transparent py-4 md:py-8'}`}>
        <div className="container mx-auto px-6 max-w-7xl flex justify-between items-center relative z-50">
          <Link href="/" className="flex items-center gap-2 group active:scale-95 transition-transform">
            <div className="bg-black dark:bg-transparent rounded-md p-0.5">
              <Layout className="h-6 w-6 text-[#CCFF00]" />
            </div>
            <span className="text-xl font-bold tracking-tight group-hover:text-[#CCFF00] transition-colors">ATTABL</span>
          </Link>

          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Link href="#features" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.features}</Link>
            <Link href="#pricing" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.pricing}</Link>
            <Link href="#about" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.about}</Link>
            <Link href="/contact" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.contact}</Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={toggleLang} className="p-2 w-10 h-10 font-bold text-xs rounded-full hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-transform">
              {lang.toUpperCase()}
            </button>
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-transform">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1"></div>
            <Link href="/login"><Button variant="ghost" className="rounded-full font-semibold px-6 active:scale-95 hover:bg-gray-200/50">{t.nav.login}</Button></Link>
            <Link href="/signup"><Button className="rounded-full bg-black dark:bg-[#1a1a1a] text-white hover:bg-gray-800 dark:hover:bg-[#CCFF00] dark:hover:text-black font-semibold px-8 active:scale-95 shadow-none border border-transparent focus-visible:ring-0">{t.nav.signup}</Button></Link>
          </div>

          <button className="md:hidden p-2 active:bg-gray-100 dark:active:bg-white/5 rounded-full transition-colors" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-10 lg:pt-40 lg:pb-20 overflow-hidden mx-auto max-w-[1400px]">
        {/* Hero Halos - Increased Opacity & Adjusted Positioning */}
        <div className="absolute top-1/2 right-[-5%] -translate-y-1/2 w-[500px] h-[500px] bg-[#CCFF00]/15 rounded-full blur-[100px] pointer-events-none z-0" />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-[#CCFF00]/15 rounded-full blur-[100px] pointer-events-none z-0" />

        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">

          {/* Left Content */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="relative z-20 flex flex-col justify-center"
          >
            {/* ANIMATED PILL BADGE */}
            <motion.div
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/50 bg-[#CCFF00]/10 text-xs font-bold tracking-wide text-black dark:text-[#CCFF00] mb-8 w-fit select-none active:scale-95 transition-transform cursor-default"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <StarIcon className="h-3 w-3 fill-current text-[#CCFF00]" />
              </span>
              <span className="mr-1">{t.hero.pill_prefix}</span>
              <div className="relative h-4 w-48 overflow-hidden">
                <AnimatePresence mode='wait'>
                  <motion.span
                    key={pillIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute left-0 top-0 whitespace-nowrap"
                  >
                    {t.hero.pills[pillIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </motion.div>

            <div className="mb-8 pl-1">
              {/* Line 1: Massive Bold */}
              <motion.h1
                variants={itemVariants}
                className="text-6xl md:text-8xl font-black tracking-tighter text-gray-900 dark:text-white mb-2 leading-none"
              >
                {t.hero.title_line1}
              </motion.h1>

              {/* Line 2: "Commander" (Green) + Highlight ("mieux") + Green Dot */}
              <motion.div
                variants={itemVariants}
                className="text-5xl md:text-7xl font-black text-[#CCFF00] tracking-tighter leading-tight"
              >
                {t.hero.title_line2} <span className="relative inline-block text-[#CCFF00]">
                  {t.hero.title_highlight}
                  <svg className="absolute w-full h-3 -bottom-1 left-0 text-[#CCFF00]" viewBox="0 0 100 10" preserveAspectRatio="none">
                    <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                </span>
                <span>.</span>
              </motion.div>
            </div>

            {/* Subtitle - Optimized for EN/FR */}
            <motion.div
              variants={itemVariants}
              className="max-w-[95%] md:max-w-xl mb-10"
            >
              <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed text-balance text-left">
                {t.hero.subtitle}
              </p>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="flex flex-col gap-6 max-w-md mb-10 md:mb-12"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-grow">
                  <input
                    type="email"
                    placeholder={t.hero.email_placeholder}
                    value={heroEmail}
                    onChange={(e) => setHeroEmail(e.target.value)}
                    className="w-full h-12 md:h-14 pl-5 pr-4 bg-white dark:bg-zinc-900 text-black dark:text-white rounded-full focus:outline-none border border-gray-200 focus:border-[#CCFF00] dark:border-white/10 font-medium placeholder:text-gray-500 shadow-none transition-colors focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <Button
                  onClick={() => router.push(`/signup?plan=essentiel${heroEmail ? `&email=${encodeURIComponent(heroEmail)}` : ''}`)}
                  className="h-12 md:h-14 px-8 rounded-full bg-[#CCFF00] hover:bg-[#b3e600]/90 text-black font-bold text-base shadow-none transition-all hover:scale-105 active:scale-95 border border-transparent w-full sm:w-auto shrink-0 focus-visible:ring-0"
                >
                  {t.hero.cta_primary}
                </Button>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="flex items-center gap-6 md:gap-8"
            >
              <div className="active:scale-95 transition-transform cursor-pointer">
                <div className="flex -space-x-3 mb-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border border-white dark:border-black bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden shadow-none">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="User" />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border border-white dark:border-black bg-black dark:bg-[#CCFF00] flex items-center justify-center text-white dark:text-black font-bold text-xs shadow-none">
                    20+
                  </div>
                </div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{t.hero.users_active}</p>
              </div>
              <div className="h-10 w-px bg-gray-200 dark:bg-white/10"></div>
              <div className="flex flex-col justify-center active:scale-95 transition-transform cursor-pointer">
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none mb-1">15+ {t.hero.partners_line1}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider leading-none">{t.hero.partners_line2}</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [0, -15, 0]
            }}
            transition={{
              opacity: { duration: 0.5, delay: 0.2 },
              scale: { duration: 0.5, delay: 0.2 },
              y: {
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }
            }}
            className="relative z-10 flex justify-center lg:justify-end mt-12 lg:mt-0"
          >
            <div className="relative w-[280px] sm:w-[350px] md:w-[400px]">
              <Image
                src="/mobile-app-mockup.png"
                alt="App Interface"
                width={800}
                height={1600}
                className="w-full h-auto shadow-none grayscale-[0.1] dark:grayscale-[0.2]"
                priority
              />
              <div className="absolute top-1/3 -left-4 md:-left-12 bg-white dark:bg-[#1a1a1a] p-3 md:p-4 rounded-xl border border-gray-200/60 dark:border-white/10 shadow-none flex items-center gap-3 md:gap-4 animate-float hover:scale-105 transition-transform duration-300">
                <div className="bg-[#CCFF00] p-2 rounded-lg text-black shadow-none">
                  <CreditCard className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] md:text-xs uppercase tracking-wider font-bold">Revenus</div>
                  <div className="text-gray-900 dark:text-white font-mono text-lg md:text-xl font-bold">$12,450</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="py-8 bg-transparent overflow-hidden border-b border-gray-100/50 dark:border-white/5 relative z-10">
        <div className="relative w-full overflow-hidden">
          {/* Gradient Masks - using page bg color to blend with halos */}
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#F9FAFB] dark:from-black to-transparent z-10 pointer-events-none"></div>
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#F9FAFB] dark:from-black to-transparent z-10 pointer-events-none"></div>

          <div className="flex gap-16 min-w-max animate-scroll">
            {/* REPEAT LOGOS 2 TIMES for smooth infinite loop (enough for width) */}
            {[...LOGOS, ...LOGOS].map((logo, i) => (
              <div key={i} className="flex items-center gap-2 opacity-40 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-300 active:scale-110">
                <logo.icon className="h-6 w-6" />
                <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white font-sans">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-zinc-950">
        <div className="container mx-auto px-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="grid md:grid-cols-3 gap-12"
          >
            {[
              {
                title: t.features.security.title,
                desc: t.features.security.desc,
                icon: ShieldCheck
              },
              {
                title: t.features.allinone.title,
                desc: t.features.allinone.desc,
                icon: Smartphone
              },
              {
                title: t.features.privacy.title,
                desc: t.features.privacy.desc,
                icon: Users
              }
            ].map((item, i) => (
              <motion.div
                variants={itemVariants}
                key={i}
                className="flex gap-6 items-start group active:scale-[0.98] transition-all p-4 rounded-2xl border border-transparent hover:border-gray-200/60 dark:hover:border-white/5 hover:bg-white dark:hover:bg-white/5 duration-300 shadow-none"
              >
                <div className="h-12 w-12 rounded-full bg-white dark:bg-[#1a1a1a] border border-[#CCFF00] flex items-center justify-center shrink-0 group-hover:bg-[#CCFF00] transition-colors duration-500 shadow-none">
                  <div className="text-[#CCFF00] group-hover:text-black transition-colors duration-500">
                    <item.icon className="h-6 w-6 fill-current" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-[#CCFF00] transition-colors">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 md:py-32 bg-white dark:bg-black border-t border-gray-100 dark:border-white/5 relative overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
            {/* Left: Sticky Title */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-1"
            >
              <div className="lg:sticky lg:top-32 mb-10 lg:mb-0">
                <div className="inline-flex items-center gap-2 mb-6 text-[#CCFF00] font-bold uppercase tracking-widest text-xs">
                  <StarIcon className="h-4 w-4 fill-current" />
                  <span>Témoignages</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight mb-6">
                  {t.testimonials.title}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed mb-8">
                  {t.testimonials.subtitle}
                </p>
                <Button variant="outline" className="border-gray-200 dark:border-white/10 hover:border-[#CCFF00] text-black dark:text-white hover:text-black rounded-full h-12 px-8 w-full md:w-auto font-bold bg-white dark:bg-black hover:bg-[#CCFF00] dark:hover:bg-[#CCFF00] transition-all active:scale-95 shadow-none focus-visible:ring-0">
                  Lire tous les avis <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>

            {/* Right: Masonry Grid */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.1 }}
              className="lg:col-span-2 grid md:grid-cols-2 gap-4 md:gap-6"
            >
              {t.testimonials.reviews.map((review, i) => (
                <motion.div
                  variants={itemVariants}
                  key={i}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={`p-5 rounded-[1.25rem] border transition-all duration-300 hover:border-[#CCFF00]/50 group cursor-default active:scale-[0.98] shadow-none ${i % 2 === 0 ? 'md:mt-0' : 'md:mt-8'
                    } ${theme === 'light' ? 'bg-white border-gray-200/60 hover:border-gray-300' : 'bg-[#0A0A0A] border-white/10 hover:bg-[#121212]'
                    }`}
                >
                  <Quote className="h-5 w-5 text-[#CCFF00] mb-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4 leading-relaxed">
                    &quot;{review.text}&quot;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 border border-[#CCFF00] flex items-center justify-center font-bold text-[10px]">
                      {review.author.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white">{review.author}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold">{review.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 md:py-32 bg-gray-50 dark:bg-[#050505] relative transition-colors duration-300 border-t border-gray-100 dark:border-white/5">
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16 md:mb-20"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">{t.pricing.title}</h2>
            <div className="flex justify-center gap-4">
              <button onClick={() => setBillingInterval('monthly')} className={`text-sm font-bold transition-all active:scale-95 ${billingInterval === 'monthly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>
                {t.pricing.monthly}
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-800"></div>
              <button onClick={() => setBillingInterval('yearly')} className={`text-sm font-bold transition-all active:scale-95 ${billingInterval === 'yearly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>
                {t.pricing.yearly}
              </button>
            </div>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="grid md:grid-cols-3 gap-8 items-center"
          >
            <motion.div variants={itemVariants}>
              <PricingCard plan="essentiel" billingInterval={billingInterval} onSelect={handlePlanSelect} />
            </motion.div>

            <motion.div variants={itemVariants} className="transform md:scale-105 z-10 my-8 md:my-0">
              <PricingCard plan="premium" billingInterval={billingInterval} onSelect={handlePlanSelect} />
            </motion.div>

            <motion.div
              variants={itemVariants}
              whileHover={{ y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full"
            >
              <div className="border border-gray-200/60 dark:border-white/10 bg-white dark:bg-[#0A0A0A] rounded-[22px] p-8 flex flex-col h-full hover:border-[#CCFF00]/30 transition-all group shadow-none active:scale-[0.99]">
                <div>
                  <h3 className="text-xl font-medium mb-1 text-gray-900 dark:text-gray-300">{t.pricing.cards.enterprise.name}</h3>
                  <p className="text-sm text-gray-500 mb-6">{t.pricing.cards.enterprise.desc}</p>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t.pricing.cards.enterprise.price}</div>
                </div>
                <Button variant="outline" className="mt-auto w-full border-gray-200 dark:border-white/10 hover:border-[#CCFF00] hover:text-[#CCFF00] bg-transparent h-12 rounded-xl active:scale-95 transition-all" onClick={() => router.push('/contact')}>
                  {t.pricing.cards.enterprise.cta}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <NewsletterSection lang={lang} />

      {/* FOOTER */}
      <footer className="py-12 bg-transparent border-t border-gray-100 dark:border-white/5">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 active:scale-95 transition-transform cursor-pointer">
            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">ATTABL</span>
          </div>
          <div className="text-sm text-gray-500">{t.footer.rights}</div>
        </div>
      </footer>
    </div>
  );
}
