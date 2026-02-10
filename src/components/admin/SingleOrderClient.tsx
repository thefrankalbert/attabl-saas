'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft } from 'lucide-react';
import OrderDetails from '@/components/admin/OrderDetails';
import type { Order } from '@/types/admin.types';

interface SingleOrderClientProps {
    order: Order;
}

export default function SingleOrderClient({ order: initialOrder }: SingleOrderClientProps) {
    const router = useRouter();

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Retour
                </Button>
                <h1 className="text-xl font-bold">Détails de la commande</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Commande #{initialOrder.id.slice(0, 8)}</CardTitle>
                </CardHeader>
                <CardContent>
                    <OrderDetails
                        order={initialOrder}
                        onClose={() => router.back()}
                        onUpdate={() => router.refresh()}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
