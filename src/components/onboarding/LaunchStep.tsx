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
      ? window.location.hostname === 'localhost'
        ? `http://${data.tenantSlug}.localhost:3000`
        : `https://${data.tenantSlug}.attabl.com`
      : `https://${data.tenantSlug}.attabl.com`;

  const completedItems = [
    { label: 'Compte créé', done: true },
    { label: 'Identité configurée', done: !!data.establishmentType },
    { label: 'Branding personnalisé', done: !!data.primaryColor },
    { label: 'Menu initialisé', done: data.menuOption !== 'skip' || true },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 text-gray-600 text-sm font-medium mb-4">
          <Rocket className="h-4 w-4" />
          Étape 4/4
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Prêt à lancer</h1>
        <p className="text-gray-500">
          Votre établissement est configuré. Vérifiez les informations ci-dessous.
        </p>
      </div>

      {/* Summary Card */}
      <div className="p-6 rounded-2xl border border-gray-200 bg-white mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: data.primaryColor || '#000' }}
          >
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo"
                className="w-full h-full rounded-2xl object-cover"
              />
            ) : (
              <Layout className="h-8 w-8 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{data.tenantName}</h2>
            <p className="text-gray-500 capitalize">
              {data.establishmentType} • {data.city || 'Non défini'}
            </p>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {completedItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  item.done ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                <Check className="h-3 w-3" />
              </div>
              <span className={item.done ? 'text-gray-900' : 'text-gray-400'}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Menu URL */}
      <div className="p-5 rounded-xl border border-gray-200 bg-gray-50 mb-5">
        <p className="text-sm text-gray-500 mb-2">Votre menu client :</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 bg-white rounded-lg border border-gray-200 font-mono text-sm text-gray-700 truncate">
            {menuUrl}
          </div>
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-gray-500" />
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
      <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100 text-center">
        <p className="text-sm text-gray-600">
          <strong>14 jours d&apos;essai gratuit</strong> — Profitez de toutes les fonctionnalités.
        </p>
      </div>
    </div>
  );
}
