'use client';

import { Rocket, Check, QrCode, ExternalLink, Download, Layout } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
    data: OnboardingData;
}

export function LaunchStep({ data }: LaunchStepProps) {
    const menuUrl = typeof window !== 'undefined'
        ? (window.location.hostname === 'localhost'
            ? `http://${data.tenantSlug}.localhost:3000`
            : `https://${data.tenantSlug}.attabl.com`)
        : `https://${data.tenantSlug}.attabl.com`;

    const completedItems = [
        { label: 'Compte créé', done: true },
        { label: 'Établissement configuré', done: !!data.establishmentType },
        { label: 'Branding personnalisé', done: !!data.primaryColor },
        { label: 'Menu préparé', done: data.menuOption !== 'skip' },
    ];

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CCFF00]/10 text-[#CCFF00] text-sm font-bold mb-4">
                    <Rocket className="h-4 w-4" />
                    Étape 4/4
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Vous êtes prêt ! 🎉
                </h1>
                <p className="text-gray-500">
                    Votre établissement est configuré. Voici un récapitulatif.
                </p>
            </div>

            {/* Summary Card */}
            <div className="p-6 rounded-2xl border-2 border-[#CCFF00] bg-[#CCFF00]/5 mb-8">
                <div className="flex items-center gap-4 mb-6">
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: data.primaryColor }}
                    >
                        {data.logoUrl ? (
                            <img src={data.logoUrl} alt="Logo" className="w-full h-full rounded-2xl object-cover" />
                        ) : (
                            <Layout className="h-8 w-8" style={{ color: data.secondaryColor }} />
                        )}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{data.tenantName}</h2>
                        <p className="text-gray-500 capitalize">
                            {data.establishmentType} • {data.city || 'Non défini'}, {data.country}
                        </p>
                    </div>
                </div>

                {/* Checklist */}
                <div className="space-y-3">
                    {completedItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${item.done ? 'bg-[#CCFF00] text-black' : 'bg-gray-200 text-gray-400'
                                }`}>
                                <Check className="h-4 w-4" />
                            </div>
                            <span className={item.done ? 'text-gray-900' : 'text-gray-400'}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Menu URL */}
            <div className="p-6 rounded-2xl border border-gray-200 bg-gray-50 mb-6">
                <p className="text-sm text-gray-500 mb-2">Votre menu client sera accessible à :</p>
                <div className="flex items-center gap-3">
                    <div className="flex-1 px-4 py-3 bg-white rounded-xl border border-gray-200 font-mono text-sm break-all">
                        {menuUrl}
                    </div>
                    <a
                        href={menuUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-white rounded-xl border border-gray-200 hover:border-[#CCFF00] transition-colors"
                    >
                        <ExternalLink className="h-5 w-5 text-gray-600" />
                    </a>
                </div>
            </div>

            {/* QR Code Section */}
            <div className="p-6 rounded-2xl border border-gray-200 bg-white mb-6">
                <div className="flex items-start gap-6">
                    <div className="w-32 h-32 bg-gray-100 rounded-xl flex items-center justify-center">
                        <QrCode className="h-16 w-16 text-gray-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-2">QR Code de votre menu</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Imprimez ce QR code et placez-le sur vos tables. Vos clients peuvent scanner
                            pour accéder au menu et commander directement.
                        </p>
                        <button
                            type="button"
                            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Télécharger le QR Code
                        </button>
                    </div>
                </div>
            </div>

            {/* Trial Reminder */}
            <div className="p-4 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/30">
                <p className="text-sm text-gray-700">
                    <strong className="text-black">🎁 14 jours d'essai gratuit</strong> — Profitez de
                    toutes les fonctionnalités sans engagement. Vous pourrez choisir votre plan après
                    dans les paramètres de facturation.
                </p>
            </div>
        </div>
    );
}
