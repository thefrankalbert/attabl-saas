'use client';

import { QRGenerator } from '@/components/qr/QRGenerator';
import { QrCode, Info } from 'lucide-react';

interface QRCodePageProps {
    tenant: {
        name: string;
        slug: string;
        logoUrl?: string;
        primaryColor: string;
        secondaryColor: string;
        description?: string;
    };
    menuUrl: string;
}

export function QRCodePage({ tenant, menuUrl }: QRCodePageProps) {
    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gray-100 rounded-xl">
                        <QrCode className="h-6 w-6 text-gray-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">QR Codes</h1>
                </div>
                <p className="text-gray-500">
                    Générez et imprimez des QR codes pour vos tables et supports.
                </p>
            </div>

            {/* Info Banner */}
            <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm text-blue-800">
                        <strong>URL de votre menu :</strong>{' '}
                        <a
                            href={menuUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:no-underline"
                        >
                            {menuUrl}
                        </a>
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                        Les clients qui scannent le QR code seront redirigés vers cette URL.
                    </p>
                </div>
            </div>

            {/* QR Generator */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <QRGenerator
                    url={menuUrl}
                    tenantName={tenant.name}
                    logoUrl={tenant.logoUrl}
                    primaryColor={tenant.primaryColor}
                    secondaryColor={tenant.secondaryColor}
                    description={tenant.description}
                />
            </div>

            {/* Tips */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-1">📱 Standard</h3>
                    <p className="text-sm text-gray-500">
                        Format carré classique, idéal pour les affichages muraux et comptoirs.
                    </p>
                </div>
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-1">🪧 Chevalet</h3>
                    <p className="text-sm text-gray-500">
                        Format vertical A6, parfait pour les chevalets de table.
                    </p>
                </div>
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-1">💳 Carte</h3>
                    <p className="text-sm text-gray-500">
                        Format carte de visite, idéal pour le room service hôtelier.
                    </p>
                </div>
            </div>
        </div>
    );
}
