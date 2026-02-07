'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log l'erreur pour monitoring (optionnel: envoyer à Sentry, etc.)
        console.error('Application error:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                {/* Icône d'erreur */}
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-600" />
                </div>

                {/* Message */}
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Oups, une erreur est survenue
                </h2>
                <p className="text-gray-600 mb-6">
                    Nous nous excusons pour ce désagrément. Veuillez réessayer ou retourner à l&apos;accueil.
                </p>

                {/* Détails pour debug (dev only) */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="mb-6 p-3 bg-red-50 rounded-lg text-left">
                        <p className="text-xs font-mono text-red-700 break-all">
                            {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs text-red-500 mt-1">
                                Digest: {error.digest}
                            </p>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                        onClick={reset}
                        className="bg-amber-600 hover:bg-amber-700"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Réessayer
                    </Button>

                    <Link href="/">
                        <Button variant="outline">
                            <Home className="w-4 h-4 mr-2" />
                            Retour à l&apos;accueil
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
