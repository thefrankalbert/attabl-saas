"use client";

import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useState } from "react";
import { PLAN_AMOUNTS } from "@/lib/stripe/server";

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
        description: "Pour démarrer votre digitalisation",
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
        description: "Pour optimiser vos opérations",
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
    const yearlyPriceMetadata = plan === 'essentiel' ? 60000 : 120000; // Prix mensuel affiché si annuel

    const displayPrice = billingInterval === 'monthly' ? monthlyPrice : yearlyPriceMetadata;
    const yearlyTotal = displayPrice * 12;

    return (
        <Card className={`relative flex flex-col ${details.highlight ? 'border-blue-500 border-2 shadow-xl scale-105 z-10' : 'border-gray-200'}`}>
            {details.highlight && (
                <div className="absolute -top-4 inset-x-0 flex justify-center">
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm uppercase tracking-wide">
                        Recommandé
                    </Badge>
                </div>
            )}

            <CardHeader className="text-center pt-8">
                <h3 className="text-2xl font-bold text-gray-900">{details.name}</h3>
                <p className="text-sm text-gray-500 mt-2">{details.description}</p>
            </CardHeader>

            <CardContent className="flex-1">
                <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-1">
                        <span className="text-4xl font-extrabold text-gray-900">
                            {displayPrice.toLocaleString('fr-FR')}
                        </span>
                        <span className="text-lg text-gray-500 font-medium">F/mois</span>
                    </div>
                    {billingInterval === 'yearly' && (
                        <p className="text-sm text-green-600 font-medium mt-2 bg-green-50 inline-block px-2 py-1 rounded">
                            Facturé {yearlyTotal.toLocaleString('fr-FR')} F par an (-20%)
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    {details.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-600 text-sm">{feature}</span>
                        </div>
                    ))}
                </div>
            </CardContent>

            <CardFooter className="pt-6 pb-8">
                <Button
                    onClick={() => onSelect(plan, billingInterval)}
                    disabled={isLoading || isCurrentPlan}
                    className={`w-full h-12 text-lg font-semibold ${details.highlight
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                            : 'bg-gray-900 hover:bg-gray-800 text-white'
                        }`}
                    variant={isCurrentPlan ? "outline" : "default"}
                >
                    {isCurrentPlan ? "Plan Actuel" : (isLoading ? "Chargement..." : "Commencer l'essai 14j")}
                </Button>
            </CardFooter>
        </Card>
    );
}
