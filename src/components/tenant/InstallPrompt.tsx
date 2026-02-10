'use client';

import { useState, useEffect } from 'react';
import { Share, X, Download, Plus } from 'lucide-react';
import Image from 'next/image';

interface InstallPromptProps {
    appName?: string;
    logoUrl?: string;
}

export default function InstallPrompt({ appName = "Attabl", logoUrl }: InstallPromptProps) {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [show, setShow] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        // Only browser side
        if (typeof window === 'undefined') return;

        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        setIsStandalone(isStandaloneMode);
        if (isStandaloneMode) return;

        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        // Check dismissal
        const dismissed = localStorage.getItem('install_prompt_dismissed_v1');
        if (dismissed) {
            const time = parseInt(dismissed);
            if (Date.now() - time < 24 * 60 * 60 * 1000) return; // 24h cooldown
        }

        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setTimeout(() => setShow(true), 3000);
        };

        window.addEventListener('beforeinstallprompt', handler);

        if (isIosDevice) {
            setTimeout(() => setShow(true), 3000);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleDismiss = () => {
        setShow(false);
        localStorage.setItem('install_prompt_dismissed_v1', Date.now().toString());
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            handleDismiss();
        }
    };

    if (!show || isStandalone) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-8 md:max-w-sm z-50 bg-[#1a1a1a] text-white rounded-xl shadow-2xl border border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 p-3">
                {logoUrl ? (
                    <Image src={logoUrl} alt={appName} width={40} height={40} className="rounded-lg bg-white p-1" />
                ) : (
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-black font-bold text-xl">
                        {appName.charAt(0)}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">Installer {appName}</h3>
                    <p className="text-[10px] text-gray-400">Accès rapide & commande simplifiée</p>
                </div>

                {isIOS ? (
                    <button onClick={() => setIsExpanded(!isExpanded)} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold whitespace-nowrap">
                        {isExpanded ? 'Fermer' : 'Comment ?'}
                    </button>
                ) : (
                    <button onClick={handleInstall} className="px-3 py-1.5 bg-white text-black rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1">
                        <Download size={14} /> Installer
                    </button>
                )}

                <button onClick={handleDismiss} className="p-1 text-gray-500 hover:text-white">
                    <X size={16} />
                </button>
            </div>

            {isIOS && isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-white/10 mt-2 text-xs text-gray-300 space-y-2">
                    <p className="flex items-center gap-2 pt-2">
                        <Share size={14} /> 1. Appuyez sur <strong>Partager</strong>
                    </p>
                    <p className="flex items-center gap-2">
                        <Plus size={14} /> 2. Sélectionnez <strong>Sur l&apos;écran d&apos;accueil</strong>
                    </p>
                </div>
            )}
        </div>
    );
}
