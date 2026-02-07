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

// ... imports

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
        name: "Prime",
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

    // Base Monthly Price (Essential updated to 39,800)
    const baseMonthlyPrice = plan === 'essentiel' ? 39800 : 79800;

    // Calculate Annual Styling
    // 15% Discount on Yearly
    const annualDiscountRate = 0.15;
    const yearlyTotalRaw = baseMonthlyPrice * 12;
    const yearlyTotalDiscounted = yearlyTotalRaw * (1 - annualDiscountRate);
    const monthlyEquivalentYearly = yearlyTotalDiscounted / 12;

    const displayPrice = billingInterval === 'monthly' ? baseMonthlyPrice : monthlyEquivalentYearly;
    // Round to nearest 100 or keep precise? Usually prices are clean. 
    // 39800 * 12 * 0.85 / 12 = 33830. Let's keep it exact integers.
    const displayPriceRounded = Math.round(displayPrice);
    const yearlyTotalRounded = Math.round(yearlyTotalDiscounted);

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
                ? 'bg-white dark:bg-[#121212] border-transparent shadow-none'
                : 'bg-white dark:bg-[#0A0A0A] border-gray-100 dark:border-white/10 shadow-none'
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
                                {displayPriceRounded.toLocaleString('fr-FR')}
                            </span>
                            <span className="text-gray-500 font-medium">/mois</span>
                        </div>
                        {billingInterval === 'yearly' && (
                            <div className="mt-2 text-xs font-bold">
                                <span className="text-green-600 dark:text-[#CCFF00] bg-green-50 dark:bg-[#CCFF00]/10 px-2 py-0.5 rounded">
                                    -15% appliqué
                                </span>
                                <span className="text-gray-400 block mt-1">
                                    Facturé {yearlyTotalRounded.toLocaleString('fr-FR')} F/an
                                </span>
                            </div>
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
                            ? 'bg-[#CCFF00] hover:bg-[#b3e600] text-black shadow-none'
                            : 'bg-black dark:bg-white/10 text-white hover:bg-gray-800 dark:hover:bg-white/20 border border-transparent dark:border-white/5'
                            }`}
                    >
                        {isCurrentPlan ? "Plan Actuel" : (isLoading ? "Chargement..." : (
                            details.highlight ? "Passer au Premium" : "Commencer gratuitement"
                        ))}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
