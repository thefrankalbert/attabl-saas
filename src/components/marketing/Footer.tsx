'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';

const footerColumns = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '/features' },
      { label: 'Tarifs', href: '/pricing' },
      { label: 'Démo', href: '/signup' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Restaurants', href: '/restaurants' },
      { label: 'Hôtels', href: '/hotels' },
      { label: 'Quick-Service', href: '/quick-service' },
      { label: 'Bars & Cafés', href: '/bars-cafes' },
      { label: 'Food Trucks', href: '/food-trucks' },
      { label: 'Boulangeries', href: '/boulangeries' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'À propos', href: '#' },
      { label: 'Contact', href: 'mailto:contact@attabl.com' },
      { label: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'CGU', href: '#' },
      { label: 'Confidentialité', href: '#' },
    ],
  },
] as const;

export default function Footer() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    console.log('Newsletter subscription:', email);
    setSubmitted(true);
    setEmail('');
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        {/* Top Section: Logo + Newsletter */}
        <div className="mb-12 flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          {/* Logo */}
          <div>
            <Link
              href="/"
              className="font-[family-name:var(--font-inter)] text-2xl font-bold text-white"
            >
              Attabl
            </Link>
            <p className="mt-2 text-sm text-neutral-400">
              La plateforme moderne pour la restauration
            </p>
          </div>

          {/* Newsletter form */}
          <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
            <input
              type="email"
              required
              placeholder="Votre email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#CCFF00] focus:outline-none focus:ring-1 focus:ring-[#CCFF00]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-[#CCFF00] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#b3e600]"
            >
              <Send className="h-4 w-4" />
              {submitted ? 'Merci !' : "S'abonner"}
            </button>
          </form>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 font-[family-name:var(--font-inter)] text-sm font-semibold text-white">
                {column.title}
              </h3>
              <ul className="space-y-3">
                {column.links.map((link) => {
                  const isExternal =
                    link.href.startsWith('mailto:') || link.href.startsWith('http');

                  return (
                    <li key={link.label}>
                      {isExternal ? (
                        <a
                          href={link.href}
                          className="block text-sm text-neutral-400 transition-colors hover:text-white"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="block text-sm text-neutral-400 transition-colors hover:text-white"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section: Copyright */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <p className="text-center text-xs text-neutral-500 sm:text-left">
            &copy; 2026 Attabl. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
