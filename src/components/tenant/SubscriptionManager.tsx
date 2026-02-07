"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { PricingCard, PricingPlan, BillingInterval } from "@/components/shared/PricingCard";

// Initialiser Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Tenant {
    id: string;
    subscription_plan: string;
    subscription_status: string;
    subscription_current_period_end: string | null;
    billing_interval: string | null;
    email?: string;
}

interface SubscriptionManagerProps {
    tenant: Tenant;
}

export function SubscriptionManager({ tenant }: SubscriptionManagerProps) {
    const [billingInterval, setBillingInterval] = useState<BillingInterval>(
        (tenant.billing_interval as BillingInterval) || 'monthly'
    );
    const [isLoading, setIsLoading] = useState<string | null>(null);

    const handleUpgrade = async (plan: PricingPlan, interval: BillingInterval) => {
        try {
            setIsLoading(plan);

            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plan,
                    billingInterval: interval,
                    tenantId: tenant.id,
                    email: tenant.email, // L'email doit être passé ou récupéré côté serveur si possible, mais ici on suppose qu'il est dans l'objet tenant ou on le demandera
                }),
            });

            const { url, error } = await response.json();

            if (error) {
                throw new Error(error);
            }

            if (url) {
                window.location.href = url;
            }
        } catch (error) {
            console.error('Erreur lors de la création de la session:', error);
            alert("Une erreur est survenue lors de l'initialisation du paiement.");
        } finally {
            setIsLoading(null);
        }
    };

    const currentPlan = tenant.subscription_plan as PricingPlan;
    // TODO: Récupérer les vraies limites depuis la DB ou des constantes
    const limits = {
        essentiel: { admins: 2, venues: 1, items: 100 },
        premium: { admins: 5, venues: 3, items: 500 },
        enterprise: { admins: 99, venues: 99, items: 9999 },
    }[currentPlan] || { admins: 0, venues: 0, items: 0 };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'trial': return 'bg-blue-100 text-blue-800';
            case 'past_due': return 'bg-orange-100 text-orange-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'Actif';
            case 'trial': return 'Essai gratuit';
            case 'past_due': return 'Paiement en retard';
            case 'cancelled': return 'Annulé';
            default: return status;
        }
    };

    return (
        <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
                {/* Statut actuel */}
                <Card>
                    <CardHeader>
                        <CardTitle>Abonnement actuel</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-sm text-gray-500">Plan</p>
                                    <p className="text-2xl font-bold capitalize">{currentPlan}</p>
                                </div>
                                <Badge className={getStatusBadge(tenant.subscription_status)}>
                                    {getStatusLabel(tenant.subscription_status)}
                                </Badge>
                            </div>

                            <div>
                                <p className="text-sm text-gray-500">Cycle de facturation</p>
                                <p className="font-medium">
                                    {tenant.billing_interval === 'yearly' ? 'Annuel (-20%)' : 'Mensuel'}
                                </p>
                            </div>

                            {tenant.subscription_current_period_end && (
                                <div>
                                    <p className="text-sm text-gray-500">Prochain renouvellement / Fin d&apos;essai</p>
                                    <p className="font-medium">
                                        {new Date(tenant.subscription_current_period_end).toLocaleDateString('fr-FR', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Limites (Mockées pour l'instant basé sur le plan) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Limites d&apos;utilisation</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-gray-600">Administrateurs</span>
                                    <span className="font-semibold">{limits.admins > 50 ? 'Illimité' : limits.admins}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '40%' }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-gray-600">Espaces</span>
                                    <span className="font-semibold">{limits.venues > 50 ? 'Illimité' : limits.venues}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '20%' }} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Changer de plan */}
            <div>
                <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Changer de plan</h2>

                    <div className="relative inline-flex bg-white p-1 rounded-full border shadow-sm mt-4 md:mt-0">
                        <button
                            onClick={() => setBillingInterval('monthly')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${billingInterval === 'monthly' ? 'bg-gray-900 text-white shadow' : 'text-gray-600'
                                }`}
                        >
                            Mensuel
                        </button>
                        <button
                            onClick={() => setBillingInterval('yearly')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1 ${billingInterval === 'yearly' ? 'bg-gray-900 text-white shadow' : 'text-gray-600'
                                }`}
                        >
                            Annuel <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full">-20%</span>
                        </button>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <PricingCard
                        plan="essentiel"
                        billingInterval={billingInterval}
                        isCurrentPlan={currentPlan === 'essentiel'}
                        onSelect={handleUpgrade}
                        isLoading={isLoading === 'essentiel'}
                    />
                    <PricingCard
                        plan="premium"
                        billingInterval={billingInterval}
                        isCurrentPlan={currentPlan === 'premium'}
                        onSelect={handleUpgrade}
                        isLoading={isLoading === 'premium'}
                    />
                </div>
            </div>
        </div>
    );
}
