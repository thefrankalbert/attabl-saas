"use client";

import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { motion } from "framer-motion";

export type PricingPlan = 'essentiel' | 'premium';
export type BillingInterval = 'monthly' | 'yearly';

interface PricingCardProps {
    plan: PricingPlan;
    billingInterval: BillingInterval;
    isCurrentPlan?: boolean;
    onSelect: (plan: PricingPlan, interval: BillingInterval) => void;
    isLoading?: boolean;
}

const PLAN_DETAILS = {
    essentiel: {
        name: "Essentiel",
        description: "Pour démarrer",
        features: [
            "1 espace restaurant",
            "Menu digital illimité",
            "2 comptes admin",
            "Support par email",
            "Photos HD",
        ],
        highlight: false,
    },
    premium: {
        name: "Premium",
        description: "Le plus populaire",
        features: [
            "3 espaces (Restaurant, Bar...)",
            "Commande à table & Room Service",
            "5 comptes admin",
            "Multi-langues (FR/EN)",
            "Support prioritaire WhatsApp",
            "Statistiques avancées",
        ],
        highlight: true,
    },
};

export function PricingCard({
    plan,
    billingInterval,
    isCurrentPlan,
    onSelect,
    isLoading
}: PricingCardProps) {
    const details = PLAN_DETAILS[plan];

    // Prix en FCFA
    const monthlyPrice = plan === 'essentiel' ? 75000 : 150000;
    const yearlyPriceMetadata = plan === 'essentiel' ? 60000 : 120000;
    const displayPrice = billingInterval === 'monthly' ? monthlyPrice : yearlyPriceMetadata;
    const yearlyTotal = displayPrice * 12;

    return (
        <motion.div
            whileHover={{ y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full relative group"
        >
            {/* Background Gradient for Highlighted Card */}
            {details.highlight && (
                <div className="absolute -inset-[1px] bg-gradient-to-b from-[#CCFF00] to-transparent rounded-[24px] opacity-100 dark:opacity-100 blur-[2px] pointer-events-none" />
            )}

            <div className={`relative flex flex-col h-full overflow-hidden transition-all duration-300 rounded-[22px] border ${details.highlight
                ? 'bg-white dark:bg-[#121212] border-transparent shadow-xl dark:shadow-none'
                : 'bg-white dark:bg-[#0A0A0A] border-gray-100 dark:border-white/10 shadow-sm dark:shadow-none'
                } group-hover:border-[#CCFF00]/30`}>

                {/* Inner Gradient for "Pro" feel on Dark Mode */}
                {details.highlight && (
                    <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#CCFF00]/10 to-transparent pointer-events-none hidden dark:block" />
                )}

                <div className="p-8 flex flex-col h-full relative z-10">

                    {/* Header */}
                    <div className="mb-6">
                        <h3 className={`text-xl font-medium mb-2 ${details.highlight ? 'text-black dark:text-white' : 'text-gray-900 dark:text-gray-300'
                            }`}>
                            {details.name}
                        </h3>

                        <div className="flex items-baseline gap-1">
                            <span className={`text-5xl font-bold tracking-tighter ${details.highlight ? 'text-black dark:text-white' : 'text-black dark:text-white'
                                }`}>
                                {displayPrice.toLocaleString('fr-FR')}
                            </span>
                            <span className="text-gray-500 font-medium">/mois</span>
                        </div>
                        {billingInterval === 'yearly' && (
                            <p className="text-[#CCFF00] text-xs font-bold mt-2">
                                Facturé {yearlyTotal.toLocaleString('fr-FR')} F/an
                            </p>
                        )}
                        <p className="text-sm text-gray-500 mt-4 h-10">{details.description}</p>
                    </div>

                    {/* Features */}
                    <div className="space-y-4 flex-grow mb-8">
                        {details.features.map((feature, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm text-gray-400">
                                <Check className={`h-4 w-4 shrink-0 mt-0.5 ${details.highlight ? 'text-[#CCFF00]' : 'text-gray-600 dark:text-gray-600'
                                    }`} />
                                <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                            </div>
                        ))}
                    </div>

                    {/* Button */}
                    <Button
                        onClick={() => onSelect(plan, billingInterval)}
                        disabled={isLoading || isCurrentPlan}
                        className={`w-full h-12 rounded-xl font-bold text-sm transition-all duration-200 ${details.highlight
                            ? 'bg-[#CCFF00] hover:bg-[#b3e600] text-black shadow-[0_0_20px_rgba(204,255,0,0.3)]'
                            : 'bg-black dark:bg-white/10 text-white hover:bg-gray-800 dark:hover:bg-white/20 border border-transparent dark:border-white/5'
                            }`}
                    >
                        {isCurrentPlan ? "Plan Actuel" : (isLoading ? "Chargement..." : (
                            details.highlight ? "Passer au Premium" : "Commencer Gratuitement"
                        ))}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
