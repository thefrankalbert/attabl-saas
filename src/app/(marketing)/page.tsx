"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  ChevronRight,
  Menu,
  X,
  PlayCircle,
  Smartphone,
  ChefHat,
  Zap,
  Layout,
  CreditCard,
  ArrowRight,
  Star as StarIcon,
  ShieldCheck,
  Users,
  Moon,
  Sun,
  Quote
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { PricingCard, PricingPlan, BillingInterval } from '@/components/shared/PricingCard';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
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
      tag: "#1 Solution Restaurant",
      pill: "Nouveau : Room Service 2.0",
      title_start: "Gérez votre",
      title_highlight: "service",
      title_end: "simplement avec Attabl",
      subtitle: "Avec Attabl, vous pouvez vendre, gérer et analyser vos performances de la manière la plus simple et rapide.",
      email_placeholder: "Entrez votre email pro",
      cta: "Démarrer",
      users_active: "Utilisateurs actifs",
      partners: "Partenaires"
    },
    features: {
      security: { title: "Securité Garantie", desc: "Paiements cryptés et données protégées. Vos clients commandent en toute confiance." },
      allinone: { title: "Tout-en-un", desc: "Menu, commande, paiement, KDS. Une seule app pour tout gérer." },
      privacy: { title: "Confidentialité", desc: "Nous ne vendons pas les données de vos clients. Vos infos restent les vôtres." }
    },
    pricing: {
      title: "Tarification Simple",
      monthly: "Mensuel",
      yearly: "Annuel",
      cards: {
        essentiel: { name: "Essentiel", desc: "Pour démarrer", cta: "Commencer Gratuitement" },
        premium: { name: "Premium", desc: "Le plus populaire", cta: "Passer au Premium" },
        enterprise: { name: "Entreprise", desc: "Pour les grands groupes.", price: "Sur mesure", cta: "Contacter" }
      }
    },
    testimonials: {
      title: "Ce que disent nos utilisateurs",
      subtitle: "Découvrez comment d'autres transforment leur gestion.",
      reviews: [
        { text: "Je l'utilise tous les jours, c'est comme le centre de commande de mon business.", author: "Thomas R.", role: "Manager" },
        { text: "Interface épurée, fonctionnalités puissantes, pas de superflu. 10/10.", author: "Sarah L.", role: "Directrice" },
        { text: "Les factures sont si simples maintenant...", author: "Marc D.", role: "Freelance" },
        { text: "J'ai enfin trouvé un outil qui s'adapte parfaitement à mon workflow.", author: "Julie M.", role: "Consultante" },
        { text: "Le suivi client et les relances de paiement n'ont jamais été aussi fluides.", author: "Alex B.", role: "Restaurateur" },
        { text: "J'ai arrêté de jongler avec 4 applis... Tout est là.", author: "Sophie K.", role: "Gérante" }
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
      tag: "#1 Restaurant Solution",
      pill: "New: Room Service 2.0",
      title_start: "Manage your",
      title_highlight: "service",
      title_end: "simply with Attabl",
      subtitle: "With Attabl, you can sell, manage, and analyze your performance in the simplest and fastest way.",
      email_placeholder: "Enter work email",
      cta: "Get Started",
      users_active: "Active Users",
      partners: "Partners"
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
        premium: { name: "Premium", desc: "Most Popular", cta: "Upgrade to Premium" },
        enterprise: { name: "Enterprise", desc: "For large groups.", price: "Custom", cta: "Contact Us" }
      }
    },
    testimonials: {
      title: "What Our Users Are Saying",
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

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();
  const [lang, setLang] = useState<'fr' | 'en'>('fr');

  // Disable parallax on mobile to prevent performance issues / weirdness, or adjust values
  const phoneY = useTransform(scrollY, [0, 600], [0, -20]);
  const textY = useTransform(scrollY, [0, 600], [0, 20]);

  useEffect(() => {
    setMounted(true);
    // Auto-detect language
    const userLang = navigator.language || navigator.languages[0];
    if (userLang.startsWith('en')) {
      setLang('en');
    } else {
      setLang('fr');
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when route changes or resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const t = translations[lang];

  const handlePlanSelect = async (plan: PricingPlan, interval: BillingInterval) => {
    router.push(`/signup?plan=${plan}&interval=${interval}`);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white font-sans selection:bg-[#CCFF00] selection:text-black overflow-x-hidden transition-colors duration-300">

      {/* HEADER */}
      <header className={`fixed top-0 z-50 w-full transition-all duration-300 ${isScrolled ? 'bg-white/90 dark:bg-black/90 backdrop-blur-md py-4 border-b border-gray-100 dark:border-white/5' : 'bg-transparent py-4 md:py-8'}`}>
        <div className="container mx-auto px-6 max-w-7xl flex justify-between items-center relative z-50">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group" onClick={closeMobileMenu}>
            <div className="relative">
              <div className="bg-black dark:bg-transparent rounded-md p-0.5">
                <Layout className="h-6 w-6 text-[#CCFF00]" />
              </div>
              <div className="absolute inset-0 bg-[#CCFF00] blur-md opacity-0 dark:opacity-50 transition-opacity"></div>
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white group-hover:text-[#a3cc00] dark:group-hover:text-[#CCFF00] transition-colors">ATTABL</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Link href="#features" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.features}</Link>
            <Link href="#pricing" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.pricing}</Link>
            <Link href="#about" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.about}</Link>
            <Link href="#contact" className="hover:text-black dark:hover:text-white transition-colors">{t.nav.contact}</Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <Link href="/login">
              <Button variant="ghost" className="rounded-full text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 font-semibold px-6 h-11 border border-gray-200 dark:border-white/20 transition-all">
                {t.nav.login}
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="rounded-full bg-black dark:bg-[#1a1a1a] text-white hover:bg-gray-800 dark:hover:bg-[#CCFF00] dark:hover:text-black font-semibold px-8 h-11 border border-transparent dark:border-white/10 dark:hover:border-[#CCFF00] transition-all">
                {t.nav.signup}
              </Button>
            </Link>
          </div>

          <button className="md:hidden p-2 text-black dark:text-white z-[60]" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* MOBILE MENU OVERLAY - FULL SCREEN */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[55] bg-white dark:bg-black p-6 md:hidden flex flex-col pt-24"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            >
              <nav className="flex flex-col gap-2 text-2xl font-bold">
                <Link href="#features" onClick={closeMobileMenu} className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white">{t.nav.features}</Link>
                <Link href="#pricing" onClick={closeMobileMenu} className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white">{t.nav.pricing}</Link>
                <Link href="#about" onClick={closeMobileMenu} className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white">{t.nav.about}</Link>
                <Link href="#contact" onClick={closeMobileMenu} className="p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-white">{t.nav.contact}</Link>
              </nav>

              <div className="h-px bg-gray-100 dark:bg-white/5 my-6"></div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-white/10">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Thème</span>
                  <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    {theme === 'dark' ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
                  </button>
                </div>

                <Link href="/login" onClick={closeMobileMenu}>
                  <Button variant="ghost" className="w-full justify-start text-lg h-14 rounded-xl border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">{t.nav.login}</Button>
                </Link>
                <Link href="/signup" onClick={closeMobileMenu}>
                  <Button className="w-full text-lg h-14 rounded-xl bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold">{t.nav.signup}</Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-32 overflow-hidden mx-auto max-w-[1400px]">
        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">

          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-20"
          >

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/50 bg-[#CCFF00]/10 text-xs font-bold tracking-wide text-black dark:text-[#CCFF00] mb-8 cursor-pointer hover:bg-[#CCFF00]/20 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
              </span>
              {t.hero.pill}
              <ChevronRight className="h-3 w-3 ml-1" />
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.1] mb-6 md:mb-8 text-gray-900 dark:text-white">
              {t.hero.title_start} <br />
              <span className="relative inline-block">
                {t.hero.title_highlight}
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-[#CCFF00]" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="5" fill="none" />
                </svg>
              </span> {t.hero.title_end.split(' ').slice(0, 1).join(' ')} <br />
              {t.hero.title_end.split(' ').slice(1).join(' ')}
            </h1>

            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 mb-8 md:mb-10 max-w-lg leading-relaxed">
              {t.hero.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-md mb-10 md:mb-12">
              <div className="relative flex-grow">
                <input
                  type="email"
                  placeholder={t.hero.email_placeholder}
                  className="w-full h-12 md:h-14 pl-12 pr-4 bg-gray-100 dark:bg-white text-black rounded-full focus:outline-none focus:ring-2 focus:ring-[#CCFF00] font-medium placeholder:text-gray-500 border border-transparent dark:border-none"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Layout className="h-5 w-5" />
                </div>
              </div>
              <Button className="h-12 md:h-14 px-8 rounded-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold text-base shadow-[0_0_20px_rgba(204,255,0,0.3)] transition-transform hover:scale-105 border-0 w-full sm:w-auto">
                {t.hero.cta}
              </Button>
            </div>

            <div className="flex items-center gap-6 md:gap-8">
              <div>
                <div className="flex -space-x-3 mb-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white dark:border-black bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="User" />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border-2 border-white dark:border-black bg-black dark:bg-[#CCFF00] flex items-center justify-center text-white dark:text-black font-bold text-xs">
                    5.0
                  </div>
                </div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span className="text-black dark:text-white text-lg mr-1">20k+</span> {t.hero.users_active}
                </p>
              </div>
              <div className="h-10 w-px bg-gray-200 dark:bg-white/10"></div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">26+</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.hero.partners}</p>
              </div>
            </div>
          </motion.div>

          {/* Right Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative z-10 flex justify-center lg:justify-end mt-12 lg:mt-0"
          >
            <div className="absolute top-0 right-10 text-[#CCFF00] animate-spin-slow hidden md:block">
              <StarIcon className="h-16 w-16 fill-current" />
            </div>
            <div className="absolute bottom-20 left-10 text-[#CCFF00] animate-bounce-slow hidden md:block">
              <StarIcon className="h-8 w-8 fill-current" />
            </div>

            <div className="relative w-[280px] sm:w-[350px] md:w-[400px]">
              <Image
                src="/mobile-app-mockup.png"
                alt="App Interface"
                width={800}
                height={1600}
                className="w-full h-auto drop-shadow-2xl grayscale-[0.1] dark:grayscale-[0.2]"
                priority
              />

              <div className="absolute top-1/3 -left-4 md:-left-12 bg-white dark:bg-[#1a1a1a] p-3 md:p-4 rounded-xl border border-gray-200 dark:border-white/10 shadow-xl flex items-center gap-3 md:gap-4 animate-float">
                <div className="bg-[#CCFF00] p-2 rounded-lg text-black">
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

      {/* FEATURES */}
      <section id="features" className="py-20 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-zinc-950">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
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
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1 }}
                key={i}
                className="flex gap-6 items-start group"
              >
                <div className="h-12 w-12 rounded-full bg-white dark:bg-[#1a1a1a] border border-[#CCFF00] flex items-center justify-center shrink-0 group-hover:bg-[#CCFF00] transition-colors duration-500 shadow-sm">
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
          </div>
        </div>
      </section>

      {/* NEW TESTIMONIALS SECTION (Smaller, Bankis Style) */}
      <section className="py-20 md:py-32 bg-white dark:bg-black border-t border-gray-100 dark:border-white/5 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-gray-50 dark:from-zinc-900/50 to-transparent pointer-events-none"></div>

        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
            {/* Left: Sticky Title */}
            <div className="lg:col-span-1">
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
                <Button variant="outline" className="border-gray-200 dark:border-white/10 hover:border-[#CCFF00] hover:text-[#CCFF00] rounded-full h-12 px-8 w-full md:w-auto">
                  Lire tous les avis <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right: Masonry Grid of Cards (REDUCED SIZE) */}
            <div className="lg:col-span-2 grid md:grid-cols-2 gap-4 md:gap-6">
              {t.testimonials.reviews.map((review, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} /* Ensure it triggers on mobile scroll */
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  transition={{ delay: i * 0.1 }}
                  className={`p-5 rounded-[1.25rem] border transition-colors duration-300 hover:border-[#CCFF00]/50 group cursor-default ${i % 2 === 0 ? 'md:mt-0' : 'md:mt-8' /* Reduced stagger */
                    } ${theme === 'light' ? 'bg-gray-50 border-gray-100 hover:bg-white hover:shadow-lg' : 'bg-[#0A0A0A] border-white/10 hover:bg-[#121212]'
                    }`}
                >
                  <Quote className="h-5 w-5 text-[#CCFF00] mb-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4 leading-relaxed">
                    "{review.text}"
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
            </div>
          </div>
        </div>
      </section>

      {/* PRICING (Softer Shadows) */}
      <section id="pricing" className="py-20 md:py-32 bg-gray-50 dark:bg-[#050505] relative transition-colors duration-300 border-t border-gray-100 dark:border-white/5">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">{t.pricing.title}</h2>
            <div className="flex justify-center gap-4">
              <button onClick={() => setBillingInterval('monthly')} className={`text-sm font-bold ${billingInterval === 'monthly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>
                {t.pricing.monthly}
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-800"></div>
              <button onClick={() => setBillingInterval('yearly')} className={`text-sm font-bold ${billingInterval === 'yearly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>
                {t.pricing.yearly}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-center">
            <PricingCard plan="essentiel" billingInterval={billingInterval} onSelect={handlePlanSelect} />

            <div className="transform md:scale-105 z-10 my-8 md:my-0">
              <PricingCard plan="premium" billingInterval={billingInterval} onSelect={handlePlanSelect} />
            </div>

            <motion.div
              whileHover={{ y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full"
            >
              <div className="border border-gray-100 dark:border-white/10 bg-white dark:bg-[#0A0A0A] rounded-[22px] p-8 flex flex-col h-full hover:border-[#CCFF00]/30 transition-all group shadow-lg dark:shadow-none">
                <div>
                  <h3 className="text-xl font-medium mb-1 text-gray-900 dark:text-gray-300">{t.pricing.cards.enterprise.name}</h3>
                  <p className="text-sm text-gray-500 mb-6">{t.pricing.cards.enterprise.desc}</p>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t.pricing.cards.enterprise.price}</div>
                </div>
                <Button variant="outline" className="mt-auto w-full border-gray-200 dark:border-white/10 hover:border-[#CCFF00] hover:text-[#CCFF00] bg-transparent h-12 rounded-xl">
                  {t.pricing.cards.enterprise.cta}
                </Button>
              </div>
            </motion.div>
          </div>
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
          <div className="text-sm text-gray-500">{t.footer.rights}</div>
        </div>
      </footer>
    </div>
  );
}
