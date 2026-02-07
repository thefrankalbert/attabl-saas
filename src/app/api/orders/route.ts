import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Types pour la requête
interface OrderItemRequest {
    id: string;
    name: string;
    name_en?: string;
    price: number;
    quantity: number;
    category_name?: string;
    selectedOption?: { name_fr: string; name_en?: string };
    selectedVariant?: { name_fr: string; name_en?: string; price: number };
}

interface CreateOrderRequest {
    items: OrderItemRequest[];
    notes?: string;
    tableNumber?: string;
    customerName?: string;
    customerPhone?: string;
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const headersList = await headers();
        const tenantSlug = headersList.get('x-tenant-slug');

        // Valider le tenant
        if (!tenantSlug) {
            return NextResponse.json(
                { error: 'Tenant non identifié' },
                { status: 400 }
            );
        }

        // Récupérer le tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, is_active')
            .eq('slug', tenantSlug)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json(
                { error: 'Restaurant non trouvé' },
                { status: 404 }
            );
        }

        if (!tenant.is_active) {
            return NextResponse.json(
                { error: 'Ce restaurant est temporairement indisponible' },
                { status: 503 }
            );
        }

        // Parser le body
        const body: CreateOrderRequest = await request.json();
        const { items, notes, tableNumber, customerName, customerPhone } = body;

        // ==========================================
        // VALIDATION 1: Panier non vide
        // ==========================================
        if (!items || items.length === 0) {
            return NextResponse.json(
                { error: 'Le panier est vide' },
                { status: 400 }
            );
        }

        // ==========================================
        // VALIDATION 2: Vérifier les prix et disponibilités actuels
        // ==========================================
        const itemIds = items.map(item => item.id);
        const { data: menuItems, error: menuError } = await supabase
            .from('menu_items')
            .select('id, name, price, is_available')
            .eq('tenant_id', tenant.id)
            .in('id', itemIds);

        if (menuError) {
            console.error('Error fetching menu items:', menuError);
            return NextResponse.json(
                { error: 'Erreur lors de la vérification du menu' },
                { status: 500 }
            );
        }

        // Map pour accès rapide
        const menuItemsMap = new Map(menuItems?.map(item => [item.id, item]) || []);

        // Vérifier chaque article
        const validationErrors: string[] = [];
        let calculatedTotal = 0;

        for (const item of items) {
            const menuItem = menuItemsMap.get(item.id);

            if (!menuItem) {
                validationErrors.push(`Article "${item.name}" non trouvé`);
                continue;
            }

            if (menuItem.is_available === false) {
                validationErrors.push(`"${menuItem.name}" n'est plus disponible`);
                continue;
            }

            // Prix avec variante ou prix de base
            const expectedPrice = item.selectedVariant?.price || menuItem.price;

            // Tolérance de 1% pour les arrondis
            if (Math.abs(item.price - expectedPrice) > expectedPrice * 0.01) {
                validationErrors.push(`Prix de "${menuItem.name}" a changé`);
            }

            calculatedTotal += item.price * item.quantity;
        }

        // Si erreurs de validation, retourner la liste
        if (validationErrors.length > 0) {
            return NextResponse.json(
                {
                    error: 'Certains articles ne sont plus valides',
                    details: validationErrors
                },
                { status: 400 }
            );
        }

        // ==========================================
        // VALIDATION 3: Total minimum (éviter commandes à 0€)
        // ==========================================
        if (calculatedTotal <= 0) {
            return NextResponse.json(
                { error: 'Le total de la commande doit être supérieur à 0' },
                { status: 400 }
            );
        }

        // ==========================================
        // CRÉATION DE LA COMMANDE
        // ==========================================

        // Générer un numéro de commande unique
        const orderNumber = `CMD-${Date.now().toString(36).toUpperCase()}`;

        // Créer la commande principale
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                tenant_id: tenant.id,
                order_number: orderNumber,
                status: 'pending',
                total: calculatedTotal,
                table_number: tableNumber || null,
                customer_name: customerName || null,
                customer_phone: customerPhone || null,
                notes: notes || null,
            })
            .select('id, order_number')
            .single();

        if (orderError) {
            console.error('Error creating order:', orderError);
            return NextResponse.json(
                { error: 'Erreur lors de la création de la commande' },
                { status: 500 }
            );
        }

        // Créer les items de commande
        const orderItems = items.map(item => ({
            order_id: order.id,
            menu_item_id: item.id,
            item_name: item.name,
            item_name_en: item.name_en || null,
            quantity: item.quantity,
            price_at_order: item.price,
            notes: item.selectedOption
                ? `${item.selectedOption.name_fr}${item.selectedVariant ? ' - ' + item.selectedVariant.name_fr : ''}`
                : (item.selectedVariant ? item.selectedVariant.name_fr : null),
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Error creating order items:', itemsError);
            // Rollback: supprimer la commande créée
            await supabase.from('orders').delete().eq('id', order.id);
            return NextResponse.json(
                { error: 'Erreur lors de l\'enregistrement des articles' },
                { status: 500 }
            );
        }

        // ==========================================
        // SUCCÈS
        // ==========================================
        return NextResponse.json({
            success: true,
            orderId: order.id,
            orderNumber: order.order_number,
            total: calculatedTotal,
            message: 'Commande enregistrée avec succès !',
        });

    } catch (error) {
        console.error('Order creation error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
