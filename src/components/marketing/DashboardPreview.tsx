'use client';

import { cn } from '@/lib/utils';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

interface DashboardPreviewProps {
  segment: Segment;
  className?: string;
}

const kpiData: Record<Segment, { label: string; value: string; trend?: string }[]> = {
  restaurant: [
    { label: 'Revenu', value: '2.4M F', trend: '+12%' },
    { label: 'Commandes', value: '152' },
    { label: 'Articles', value: '48' },
    { label: 'Panier moy.', value: '13.1K' },
  ],
  boutique: [
    { label: 'Ventes', value: '1.8M F', trend: '+8%' },
    { label: 'Transactions', value: '89' },
    { label: 'Produits', value: '234' },
    { label: 'Panier moy.', value: '15.5K' },
  ],
  salon: [
    { label: 'Revenu', value: '980K F', trend: '+15%' },
    { label: 'RDV', value: '94' },
    { label: 'Prestations', value: '18' },
    { label: 'Panier moy.', value: '10.4K' },
  ],
  hotel: [
    { label: 'Revenu', value: '5.1M F', trend: '+6%' },
    { label: 'Reservations', value: '63' },
    { label: 'Chambres', value: '42' },
    { label: 'Rev/chambre', value: '81.3K' },
  ],
};

const chartBars: Record<Segment, number[]> = {
  restaurant: [45, 60, 55, 80, 65, 90, 50],
  boutique: [70, 55, 85, 60, 45, 75, 40],
  salon: [50, 40, 70, 55, 80, 60, 45],
  hotel: [85, 65, 50, 70, 90, 55, 75],
};

const orderData: Record<Segment, { name: string; items: string; price: string; status: string }[]> =
  {
    restaurant: [
      { name: 'Table 4', items: '2x Poulet, 1x Jus', price: '18.5K', status: 'bg-green-500' },
      { name: 'Table 12', items: '1x Ndole, 2x Biere', price: '14.2K', status: 'bg-blue-500' },
      { name: 'Table 7', items: '3x Pizza, 1x Coca', price: '22.0K', status: 'bg-yellow-500' },
      {
        name: 'Table 2',
        items: '1x Poisson grille',
        price: '31.8K',
        status: 'bg-green-500',
      },
      {
        name: 'Emporter #45',
        items: '2x Burger, Frites',
        price: '9.5K',
        status: 'bg-blue-500',
      },
    ],
    boutique: [
      { name: 'Vente #301', items: '1x Robe wax', price: '15.0K', status: 'bg-green-500' },
      { name: 'Vente #302', items: '2x Sac cuir', price: '45.0K', status: 'bg-blue-500' },
      { name: 'Vente #303', items: '3x Bijoux', price: '26.7K', status: 'bg-green-500' },
      { name: 'Vente #304', items: '1x Chaussures', price: '18.5K', status: 'bg-yellow-500' },
      { name: 'Vente #305', items: '2x T-shirt', price: '12.0K', status: 'bg-green-500' },
    ],
    salon: [
      {
        name: 'RDV Marie T.',
        items: 'Coupe + Coloration',
        price: '15.0K',
        status: 'bg-green-500',
      },
      { name: 'RDV Aisha K.', items: 'Tresses', price: '12.0K', status: 'bg-blue-500' },
      { name: 'RDV Paul M.', items: 'Coupe homme', price: '3.5K', status: 'bg-green-500' },
      { name: 'RDV Fatou D.', items: 'Soin cheveux', price: '8.0K', status: 'bg-yellow-500' },
      { name: 'RDV Ines B.', items: 'Manucure', price: '5.0K', status: 'bg-green-500' },
    ],
    hotel: [
      { name: 'Ch. 201', items: 'Suite junior', price: '85.0K', status: 'bg-green-500' },
      { name: 'Ch. 105', items: 'Chambre double', price: '45.0K', status: 'bg-blue-500' },
      { name: 'Room svc', items: '2x Petit-dej', price: '25.0K', status: 'bg-green-500' },
      { name: 'Ch. 312', items: 'Chambre simple', price: '32.0K', status: 'bg-yellow-500' },
      { name: 'Ch. 408', items: 'Suite deluxe', price: '120K', status: 'bg-blue-500' },
    ],
  };

const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function DashboardPreview({ segment, className }: DashboardPreviewProps) {
  const kpis = kpiData[segment];
  const bars = chartBars[segment];
  const orders = orderData[segment];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-200 shadow-2xl shadow-neutral-900/10',
        className,
      )}
    >
      {/* Window Chrome (macOS style) */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[9px] font-medium text-neutral-400">app.attabl.com</span>
      </div>

      {/* App Shell */}
      <div className="flex aspect-[16/10]">
        {/* Mini Sidebar */}
        <div className="flex w-12 flex-col items-center gap-1 border-r border-app-border bg-app-card py-2">
          {/* Logo */}
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted">
            <span className="text-[8px] font-black text-accent">A</span>
          </div>
          {/* Nav items */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-lg',
                i === 0 ? 'bg-accent-muted' : 'bg-transparent',
              )}
            >
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  i === 0 ? 'bg-accent' : 'bg-app-text-muted/30',
                )}
              />
            </div>
          ))}
          {/* Spacer + settings */}
          <div className="flex-1" />
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-transparent">
            <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/30" />
          </div>
        </div>

        {/* Main Area */}
        <div className="flex flex-1 flex-col">
          {/* Top Bar */}
          <div className="flex h-7 items-center justify-between border-b border-app-border bg-app-bg px-3">
            <span className="text-[8px] text-app-text-muted">Dashboard</span>
            <div className="h-4 w-4 rounded-full bg-app-elevated" />
          </div>

          {/* Content */}
          <div className="flex flex-1 gap-2 bg-app-bg p-2">
            {/* Left Column */}
            <div className="flex flex-1 flex-col gap-1.5">
              {/* Stats Row (4 mini KPIs) */}
              <div className="grid grid-cols-4 gap-1">
                {kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-lg border border-app-border bg-app-card p-1.5"
                  >
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[9px] font-bold tabular-nums text-app-text">
                        {kpi.value}
                      </span>
                      {kpi.trend && <span className="text-[6px] text-green-500">{kpi.trend}</span>}
                    </div>
                    <p className="mt-0.5 text-[6px] text-app-text-muted">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Chart Area */}
              <div className="flex flex-1 flex-col rounded-lg border border-app-border bg-app-card p-2">
                {/* Chart Header */}
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[7px] font-semibold uppercase tracking-wider text-app-text-muted">
                    Revenu - 7 jours
                  </span>
                  <div className="flex rounded bg-app-elevated p-0.5">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[6px] font-bold text-accent-text">
                      7J
                    </span>
                    <span className="px-1.5 py-0.5 text-[6px] font-bold text-app-text-muted">
                      30J
                    </span>
                  </div>
                </div>

                {/* Bars */}
                <div className="flex flex-1 items-end gap-0.5">
                  {bars.map((height, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center">
                      <div className="flex h-16 w-full items-end">
                        <div
                          className={cn(
                            'w-full rounded-t-sm transition-all duration-300',
                            i === bars.indexOf(Math.max(...bars))
                              ? 'bg-green-500'
                              : 'bg-green-500/70',
                          )}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="mt-0.5 text-[5px] text-app-text-muted">{dayLabels[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — Orders */}
            <div className="flex w-[45%] flex-col overflow-hidden rounded-lg border border-app-border bg-app-card">
              {/* Orders Header */}
              <div className="flex items-center justify-between border-b border-app-border px-2 py-1.5">
                <span className="text-[7px] font-semibold uppercase tracking-wider text-app-text-muted">
                  Commandes recentes
                </span>
                <span className="text-[7px] font-semibold text-accent">Tout voir</span>
              </div>

              {/* Orders List */}
              <div className="flex-1">
                {orders.map((order, i) => (
                  <div
                    key={order.name}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5',
                      i < orders.length - 1 && 'border-b border-app-border',
                    )}
                  >
                    <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', order.status)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[8px] font-medium text-app-text">{order.name}</p>
                      <p className="truncate text-[6px] text-app-text-muted">{order.items}</p>
                    </div>
                    <span className="shrink-0 text-[8px] font-bold tabular-nums text-app-text">
                      {order.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
