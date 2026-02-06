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
  Sun
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { PricingCard, PricingPlan, BillingInterval } from '@/components/shared/PricingCard';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useTheme } from "next-themes";

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();

  const phoneY = useTransform(scrollY, [0, 600], [0, -50]);
  const textY = useTransform(scrollY, [0, 600], [0, 50]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePlanSelect = async (plan: PricingPlan, interval: BillingInterval) => {
    router.push(`/signup?plan=${plan}&interval=${interval}`);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white font-sans selection:bg-[#CCFF00] selection:text-black overflow-x-hidden transition-colors duration-300">

      {/* HEADER */}
      <header className={`fixed top-0 z-50 w-full transition-all duration-300 ${isScrolled ? 'bg-white/90 dark:bg-black/90 backdrop-blur-md py-4 border-b border-gray-100 dark:border-white/5' : 'bg-transparent py-8'}`}>
        <div className="container mx-auto px-6 max-w-7xl flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 z-50 group">
            <div className="relative">
              <div className="bg-black dark:bg-transparent rounded-md p-0.5">
                <Layout className="h-6 w-6 text-[#CCFF00]" />
              </div>
              <div className="absolute inset-0 bg-[#CCFF00] blur-md opacity-0 dark:opacity-50 transition-opacity"></div>
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white group-hover:text-[#a3cc00] dark:group-hover:text-[#CCFF00] transition-colors">ATTABL</span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-gray-500 dark:text-gray-400">
            {['Fonctionnalités', 'Tarifs', 'À propos', 'Contact'].map((item) => (
              <Link key={item} href={`#${item.toLowerCase()}`} className="hover:text-black dark:hover:text-white transition-colors">
                {item}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <Link href="/login">
              <Button variant="ghost" className="rounded-full text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 font-semibold px-6 h-11 border border-gray-200 dark:border-white/20 transition-all">
                Connexion
              </Button>
            </Link>
            <Link href="/signup">
              {/* Button "S'inscrire" -> Secondary */}
              <Button className="rounded-full bg-black dark:bg-[#1a1a1a] text-white hover:bg-gray-800 dark:hover:bg-[#CCFF00] dark:hover:text-black font-semibold px-8 h-11 border border-transparent dark:border-white/10 dark:hover:border-[#CCFF00] transition-all">
                S'inscrire
              </Button>
            </Link>
          </div>

          <button className="md:hidden z-50 text-black dark:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden mx-auto max-w-[1400px]">
        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">

          {/* Left Content */}
          <motion.div style={{ y: textY }} className="relative z-20">

            {/* Feature Pill Rollback + Green Enforced */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/50 bg-[#CCFF00]/10 text-xs font-bold tracking-wide text-black dark:text-[#CCFF00] mb-8 cursor-pointer hover:bg-[#CCFF00]/20 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
              </span>
              Nouveau : Room Service 2.0
              <ChevronRight className="h-3 w-3 ml-1" />
            </div>

            <h1 className="text-5xl md:text-7xl font-bold leading-[1.1] mb-8 text-gray-900 dark:text-white">
              Gérez votre <br />
              <span className="relative inline-block">
                service
                {/* Underline: Neon Green ALWAYS */}
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-[#CCFF00]" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="5" fill="none" />
                </svg>
              </span> simplement <br />
              avec Attabl
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-10 max-w-lg leading-relaxed">
              Avec Attabl, vous pouvez vendre, gérer et analyser vos performances de la manière la plus simple et rapide.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 max-w-md mb-12">
              <div className="relative flex-grow">
                <input
                  type="email"
                  placeholder="Entrez votre email pro"
                  className="w-full h-14 pl-12 pr-4 bg-gray-100 dark:bg-white text-black rounded-full focus:outline-none focus:ring-2 focus:ring-[#CCFF00] font-medium placeholder:text-gray-500 border border-transparent dark:border-none"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Layout className="h-5 w-5" />
                </div>
              </div>
              {/* Démarrer Button: Neon Green ALWAYS */}
              <Button className="h-14 px-8 rounded-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold text-base shadow-[0_0_20px_rgba(204,255,0,0.3)] transition-transform hover:scale-105 border-0">
                Démarrer
              </Button>
            </div>

            {/* Partners */}
            <div className="flex items-center gap-8">
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
                  <span className="text-black dark:text-white text-lg mr-1">20k+</span> Utilisateurs actifs
                </p>
              </div>
              <div className="h-10 w-px bg-gray-200 dark:bg-white/10"></div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">26+</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Partenaires</p>
              </div>
            </div>
          </motion.div>

          {/* Right Image */}
          <motion.div style={{ y: phoneY }} className="relative z-10 flex justify-center lg:justify-end">
            <div className="absolute top-0 right-10 text-[#CCFF00] animate-spin-slow">
              <StarIcon className="h-16 w-16 fill-current" />
            </div>
            <div className="absolute bottom-20 left-10 text-[#CCFF00] animate-bounce-slow">
              <StarIcon className="h-8 w-8 fill-current" />
            </div>

            <div className="relative w-[350px] md:w-[400px]">
              <Image
                src="/mobile-app-mockup.png"
                alt="App Interface"
                width={800}
                height={1600}
                className="w-full h-auto drop-shadow-2xl grayscale-[0.1] dark:grayscale-[0.2]"
                priority
              />

              {/* Floating Card */}
              <div className="absolute top-1/3 -left-12 bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/10 shadow-xl flex items-center gap-4 animate-float">
                <div className="bg-[#CCFF00] p-2 rounded-lg text-black">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">Revenus</div>
                  <div className="text-gray-900 dark:text-white font-mono text-xl font-bold">$12,450</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* THREE COLUMN GRID */}
      <section className="py-20 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-zinc-950">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                title: "Securité Garantie",
                desc: "Paiements cryptés et données protégées. Vos clients commandent en toute confiance.",
                icon: ShieldCheck
              },
              {
                title: "Tout-en-un",
                desc: "Menu, commande, paiement, KDS. Une seule app pour tout gérer.",
                icon: Smartphone
              },
              {
                title: "Confidentialité",
                desc: "Nous ne vendons pas les données de vos clients. Vos infos restent les vôtres.",
                icon: Users
              }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start group">
                {/* Icons Circle: Border Green, Icon Green */}
                <div className="h-12 w-12 rounded-full bg-white dark:bg-[#1a1a1a] border border-[#CCFF00] flex items-center justify-center shrink-0 group-hover:bg-[#CCFF00] transition-colors duration-500 shadow-sm">
                  <div className="text-[#CCFF00] group-hover:text-black transition-colors duration-500">
                    <item.icon className="h-6 w-6 fill-current" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-[#CCFF00] transition-colors">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING REDESIGNED */}
      <section id="pricing" className="py-32 bg-white dark:bg-black relative transition-colors duration-300">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Tarification Simple</h2>
            <div className="flex justify-center gap-4">
              <button onClick={() => setBillingInterval('monthly')} className={`text-sm font-bold ${billingInterval === 'monthly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>Mensuel</button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-800"></div>
              <button onClick={() => setBillingInterval('yearly')} className={`text-sm font-bold ${billingInterval === 'yearly' ? 'text-[#CCFF00] dark:text-[#CCFF00]' : 'text-gray-400'}`}>Annuel</button>
            </div>
          </div>

          {/* Modified Grid for New Card Design: Remove wrapper div around premium card */}
          <div className="grid md:grid-cols-3 gap-8 items-center">
            <PricingCard plan="essentiel" billingInterval={billingInterval} onSelect={handlePlanSelect} />

            <div className="transform scale-105 z-10">
              <PricingCard plan="premium" billingInterval={billingInterval} onSelect={handlePlanSelect} />
            </div>

            {/* Enterprise Card */}
            <div className="border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] rounded-[22px] p-8 flex flex-col h-full hover:border-[#CCFF00]/30 transition-all group">
              <div>
                <h3 className="text-xl font-medium mb-1 text-gray-900 dark:text-gray-300">Entreprise</h3>
                <p className="text-sm text-gray-500 mb-6">Pour les grands groupes.</p>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Sur mesure</div>
              </div>
              <Button variant="outline" className="mt-auto w-full border-gray-200 dark:border-white/10 hover:border-[#CCFF00] hover:text-[#CCFF00] bg-transparent h-12 rounded-xl">Contacter</Button>
            </div>
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
          <div className="text-sm text-gray-500">© 2026 Attabl Inc.</div>
        </div>
      </footer>
    </div>
  );
}
