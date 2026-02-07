'use client';

import { UtensilsCrossed, Plus, FileSpreadsheet, LayoutTemplate, FastForward } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface MenuStepProps {
    data: OnboardingData;
    updateData: (data: Partial<OnboardingData>) => void;
}

const menuOptions = [
    {
        id: 'manual',
        title: 'Créer manuellement',
        description: 'Ajoutez vos articles un par un',
        icon: Plus,
        recommended: false,
    },
    {
        id: 'template',
        title: 'Utiliser un template',
        description: 'Commencez avec un menu pré-rempli',
        icon: LayoutTemplate,
        recommended: true,
    },
    {
        id: 'import',
        title: 'Importer un fichier',
        description: 'CSV ou Excel avec vos articles',
        icon: FileSpreadsheet,
        recommended: false,
    },
    {
        id: 'skip',
        title: 'Passer pour l\'instant',
        description: 'Je configurerai le menu plus tard',
        icon: FastForward,
        recommended: false,
    },
];

const menuTemplates = [
    { id: 'restaurant-africain', name: 'Restaurant Africain', items: 15, emoji: '🍲' },
    { id: 'restaurant-francais', name: 'Restaurant Français', items: 20, emoji: '🥐' },
    { id: 'fast-food', name: 'Fast Food', items: 12, emoji: '🍔' },
    { id: 'cafe', name: 'Café & Pâtisserie', items: 18, emoji: '☕' },
    { id: 'bar', name: 'Bar & Cocktails', items: 25, emoji: '🍸' },
    { id: 'hotel', name: 'Room Service Hôtel', items: 30, emoji: '🏨' },
];

export function MenuStep({ data, updateData }: MenuStepProps) {
    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CCFF00]/10 text-[#CCFF00] text-sm font-bold mb-4">
                    <UtensilsCrossed className="h-4 w-4" />
                    Étape 3/4
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Créez votre premier menu
                </h1>
                <p className="text-gray-500">
                    Choisissez comment vous souhaitez commencer.
                </p>
            </div>

            {/* Menu Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {menuOptions.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => updateData({ menuOption: option.id as OnboardingData['menuOption'] })}
                        className={`p-6 rounded-2xl border-2 text-left transition-all relative ${data.menuOption === option.id
                                ? 'border-[#CCFF00] bg-[#CCFF00]/5'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        {option.recommended && (
                            <span className="absolute -top-2 right-4 px-2 py-0.5 bg-[#CCFF00] text-black text-xs font-bold rounded-full">
                                Recommandé
                            </span>
                        )}
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${data.menuOption === option.id
                                    ? 'bg-[#CCFF00] text-black'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                        >
                            <option.icon className="h-6 w-6" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">{option.title}</h3>
                        <p className="text-sm text-gray-500">{option.description}</p>
                    </button>
                ))}
            </div>

            {/* Template Selection (shown when template option is selected) */}
            {data.menuOption === 'template' && (
                <div className="mt-8">
                    <h3 className="font-bold text-gray-900 mb-4">Choisissez un template</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {menuTemplates.map((template) => (
                            <button
                                key={template.id}
                                type="button"
                                className="p-4 rounded-xl border border-gray-200 hover:border-[#CCFF00] hover:bg-[#CCFF00]/5 text-left transition-all"
                            >
                                <span className="text-3xl mb-2 block">{template.emoji}</span>
                                <h4 className="font-medium text-gray-900 text-sm">{template.name}</h4>
                                <p className="text-xs text-gray-500">{template.items} articles</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Skip Message */}
            {data.menuOption === 'skip' && (
                <div className="mt-8 p-6 rounded-2xl bg-gray-50 border border-gray-100">
                    <p className="text-gray-600">
                        <strong>Pas de problème !</strong> Vous pourrez créer votre menu depuis le dashboard
                        dans la section <span className="font-medium">Menus</span>.
                    </p>
                </div>
            )}

            {/* Manual Entry (simplified for onboarding) */}
            {data.menuOption === 'manual' && (
                <div className="mt-8 p-6 rounded-2xl bg-gray-50 border border-gray-100">
                    <p className="text-gray-600">
                        Vous pourrez ajouter vos articles en détail depuis le dashboard.
                        Pour l'instant, continuez vers l'étape suivante.
                    </p>
                </div>
            )}

            {/* Import (simplified for onboarding) */}
            {data.menuOption === 'import' && (
                <div className="mt-8 p-6 rounded-2xl bg-gray-50 border border-gray-100">
                    <p className="text-gray-600">
                        L'import de fichier sera disponible depuis le dashboard dans la section <span className="font-medium">Menus</span>.
                        Continuez pour l'instant.
                    </p>
                </div>
            )}
        </div>
    );
}
