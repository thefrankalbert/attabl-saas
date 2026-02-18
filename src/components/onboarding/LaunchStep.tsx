/* eslint-disable @next/next/no-img-element */
'use client';

import { Rocket, Check, ExternalLink, Layout } from 'lucide-react';
import { LaunchQR } from '@/components/qr/LaunchQR';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
  data: OnboardingData;
}

export function LaunchStep({ data }: LaunchStepProps) {
  const menuUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/sites/${data.tenantSlug}`
      : `https://attabl.com/sites/${data.tenantSlug}`;

  const completedItems = [
    { label: 'Compte créé', done: true },
    { label: 'Identité configurée', done: !!data.establishmentType },
    { label: 'Tables configurées', done: true },
    { label: 'Branding personnalisé', done: !!data.primaryColor },
    { label: 'Menu initialisé', done: data.menuOption !== 'skip' || true },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-neutral-600 text-sm font-medium mb-2">
          <Rocket className="h-3.5 w-3.5" />
          Étape 5/5
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">Prêt à lancer</h1>
        <p className="text-neutral-500 text-sm">
          Votre établissement est configuré. Vérifiez les informations ci-dessous.
        </p>
      </div>

      {/* Summary Card */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: data.primaryColor || '#000' }}
          >
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo"
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <Layout className="h-6 w-6 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{data.tenantName}</h2>
            <p className="text-neutral-500 capitalize text-sm">
              {data.establishmentType} • {data.city || 'Non défini'}
            </p>
          </div>
        </div>

        {/* Checklist — inline */}
        <div className="grid grid-cols-2 gap-2">
          {completedItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  item.done ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-400'
                }`}
              >
                <Check className="h-2.5 w-2.5" />
              </div>
              <span className={`text-sm ${item.done ? 'text-neutral-900' : 'text-neutral-400'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Menu URL */}
      <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 mb-4">
        <p className="text-xs text-neutral-500 mb-1.5">Votre menu client :</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-white rounded-lg border border-neutral-200 font-mono text-xs text-neutral-700 truncate">
            {menuUrl}
          </div>
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-neutral-500" />
          </a>
        </div>
      </div>

      {/* QR Code */}
      <LaunchQR
        url={menuUrl}
        tenantName={data.tenantName}
        logoUrl={data.logoUrl}
        primaryColor={data.primaryColor}
      />

      {/* Trial Info */}
      <div className="mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-100 text-center">
        <p className="text-xs text-neutral-600">
          <strong>14 jours d&apos;essai gratuit</strong> — Profitez de toutes les fonctionnalités.
        </p>
      </div>
    </div>
  );
}
