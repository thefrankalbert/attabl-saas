import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Clock, MapPin, User, AlertCircle } from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  price_at_order: number;
  item_name: string;
  item_name_en?: string;
  notes?: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  table_number?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  order_items: OrderItem[];
}

export default async function OrdersPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Récupérer le tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  // Mode dev : afficher un placeholder si pas de tenant
  if (tenantError || !tenant) {
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Commandes</h1>
            <p className="text-gray-500 mt-1">Gestion des commandes</p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="mb-8 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Configuration requise</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Le tenant &quot;{tenantSlug}&quot; n&apos;est pas encore configuré.
                  Les commandes apparaîtront ici une fois la base de données configurée.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <DemoOrders />
      </div>
    );
  }

  // Récupérer les commandes du restaurant
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        quantity,
        price_at_order,
        item_name,
        item_name_en,
        notes
      )
    `)
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'En attente', color: 'text-yellow-800', bgColor: 'bg-yellow-100' },
    confirmed: { label: 'Confirmée', color: 'text-blue-800', bgColor: 'bg-blue-100' },
    preparing: { label: 'En préparation', color: 'text-purple-800', bgColor: 'bg-purple-100' },
    ready: { label: 'Prête', color: 'text-green-800', bgColor: 'bg-green-100' },
    delivered: { label: 'Livrée', color: 'text-gray-800', bgColor: 'bg-gray-100' },
    cancelled: { label: 'Annulée', color: 'text-red-800', bgColor: 'bg-red-100' },
  };

  // Grouper les commandes par statut
  const activeOrders = orders?.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)) || [];
  const completedOrders = orders?.filter(o => ['delivered', 'cancelled'].includes(o.status)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Commandes</h1>
          <p className="text-gray-500 mt-1">{tenant.name}</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {orders?.length || 0} commande(s)
        </Badge>
      </div>

      {/* Commandes actives */}
      {activeOrders.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            Commandes actives ({activeOrders.length})
          </h2>
          <div className="grid gap-4">
            {activeOrders.map((order: Order) => (
              <OrderCard key={order.id} order={order} statusConfig={statusConfig} />
            ))}
          </div>
        </div>
      )}

      {/* Commandes terminées */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-gray-500" />
          Historique
        </h2>
        {completedOrders.length > 0 ? (
          <div className="grid gap-4">
            {completedOrders.map((order: Order) => (
              <OrderCard key={order.id} order={order} statusConfig={statusConfig} />
            ))}
          </div>
        ) : orders && orders.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune commande pour le moment</p>
              <p className="text-sm text-gray-400 mt-1">
                Les nouvelles commandes apparaîtront ici
              </p>
            </CardContent>
          </Card>
        ) : (
          <p className="text-gray-500 text-sm">Aucune commande terminée</p>
        )}
      </div>
    </div>
  );
}

// Composant pour une carte de commande
function OrderCard({
  order,
  statusConfig
}: {
  order: Order;
  statusConfig: Record<string, { label: string; color: string; bgColor: string }>;
}) {
  const status = statusConfig[order.status] || { label: order.status, color: 'text-gray-800', bgColor: 'bg-gray-100' };

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Commande #{order.order_number || order.id.slice(-6)}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(order.created_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Info client/table */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          {order.table_number && (
            <div className="flex items-center gap-1.5 text-gray-600">
              <MapPin className="h-4 w-4" />
              Table {order.table_number}
            </div>
          )}
          {order.customer_name && (
            <div className="flex items-center gap-1.5 text-gray-600">
              <User className="h-4 w-4" />
              {order.customer_name}
            </div>
          )}
        </div>

        {/* Items de la commande */}
        <div className="space-y-2 mb-4 bg-gray-50 rounded-lg p-3">
          {order.order_items && order.order_items.map((item: OrderItem) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-700">
                <span className="font-medium">{item.quantity}x</span> {item.item_name}
              </span>
              <span className="font-medium text-gray-900">
                {(item.quantity * Number(item.price_at_order)).toLocaleString('fr-FR')} F
              </span>
            </div>
          ))}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="mb-4 p-2 bg-yellow-50 rounded-lg text-sm text-yellow-800">
            <span className="font-medium">Note:</span> {order.notes}
          </div>
        )}

        {/* Total */}
        <div className="pt-3 border-t flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {order.order_items?.length || 0} article(s)
          </div>
          <div className="text-xl font-bold">
            {Number(order.total || 0).toLocaleString('fr-FR')} F
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Composant de démo pour le mode développement
function DemoOrders() {
  // Utiliser des dates statiques pour éviter les problèmes de pureté React
  const demoOrders = [
    {
      id: '1',
      order_number: 'CMD-001',
      status: 'preparing',
      total: 15500,
      created_at: '2026-02-05T12:00:00.000Z',
      table_number: '5',
      customer_name: 'Client Demo',
      order_items: [
        { id: '1', quantity: 2, price_at_order: 4500, item_name: 'Poulet Yassa' },
        { id: '2', quantity: 1, price_at_order: 6500, item_name: 'Thieboudienne' },
      ]
    },
    {
      id: '2',
      order_number: 'CMD-002',
      status: 'pending',
      total: 8000,
      created_at: '2026-02-05T11:30:00.000Z',
      table_number: '3',
      order_items: [
        { id: '3', quantity: 2, price_at_order: 4000, item_name: 'Brochettes' },
      ]
    }
  ];

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'En attente', color: 'text-yellow-800', bgColor: 'bg-yellow-100' },
    preparing: { label: 'En préparation', color: 'text-purple-800', bgColor: 'bg-purple-100' },
  };

  return (
    <div className="opacity-75">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-orange-500" />
        Commandes actives (Démo)
      </h2>
      <div className="grid gap-4">
        {demoOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order as Order}
            statusConfig={statusConfig}
          />
        ))}
      </div>
    </div>
  );
}
