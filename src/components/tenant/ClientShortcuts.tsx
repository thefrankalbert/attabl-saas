'use client';

import { Utensils, ShoppingBag, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';

interface ClientShortcutsProps {
    onSearchClick: () => void;
    primaryColor?: string;
    className?: string;
}

export default function ClientShortcuts({ onSearchClick, primaryColor = '#000000', className = '' }: ClientShortcutsProps) {
    const { toast } = useToast();
    const [loadingWaiter, setLoadingWaiter] = useState(false);

    // Mock function for calling waiter
    const callWaiter = () => {
        setLoadingWaiter(true);
        setTimeout(() => {
            toast({
                title: "Serveur appelé",
                description: "Un membre de l'équipe arrive à votre table.",
            });
            setLoadingWaiter(false);
        }, 1500);
    };

    return (
        <div className={`grid grid-cols-4 gap-3 mb-8 ${className}`}>
            <ShortcutButton
                icon={<Utensils className="w-5 h-5" />}
                label="Sur place"
                onClick={() => toast({ title: "Mode Sur Place activé" })}
                color={primaryColor}
            />
            <ShortcutButton
                icon={<ShoppingBag className="w-5 h-5" />}
                label="À emporter"
                onClick={() => toast({ title: "Mode À Emporter activé" })}
                color={primaryColor}
            />
            <ShortcutButton
                icon={<Bell className={`w-5 h-5 ${loadingWaiter ? 'animate-swing' : ''}`} />}
                label="Serveur"
                onClick={callWaiter}
                disabled={loadingWaiter}
                color={primaryColor}
            />
            <ShortcutButton
                icon={<Search className="w-5 h-5" />}
                label="Recherche"
                onClick={onSearchClick}
                color={primaryColor}
            />
        </div>
    );
}

function ShortcutButton({ icon, label, onClick, disabled, color }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-center gap-2 group active:scale-95 transition-transform"
        >
            <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 group-hover:shadow-md transition-all bg-white"
                style={{ color: color }}
            >
                {icon}
            </div>
            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-center leading-tight">
                {label}
            </span>
        </button>
    );
}
