'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type Segment = 'restaurant' | 'hotel' | 'quickservice' | 'bar' | 'fastfood';

type StatKey =
  | 'revenue'
  | 'orders'
  | 'articles'
  | 'tables'
  | 'checkins'
  | 'rooms'
  | 'occupancy'
  | 'avgTime'
  | 'cocktails'
  | 'drive';

interface DashboardPreviewProps {
  segment: Segment;
  className?: string;
}

// Brand / demo display names kept in French since they represent the
// fictive African francophone establishments ATTABL targets. Not i18n.
const brandNames: Record<Segment, string> = {
  restaurant: 'Le Jardin',
  hotel: 'Prestige Hotel',
  quickservice: 'Chez Mama',
  bar: 'Le Zinc',
  fastfood: 'Flame Burger',
};

const gaugeData: Record<Segment, { statKey: StatKey; value: string; color: string }[]> = {
  restaurant: [
    { statKey: 'revenue', value: '847K', color: '#4ade80' },
    { statKey: 'orders', value: '152', color: '#60a5fa' },
    { statKey: 'articles', value: '48', color: '#f97316' },
    { statKey: 'tables', value: '24', color: '#a78bfa' },
  ],
  hotel: [
    { statKey: 'revenue', value: '2.8M', color: '#4ade80' },
    { statKey: 'checkins', value: '31', color: '#60a5fa' },
    { statKey: 'rooms', value: '42', color: '#f97316' },
    { statKey: 'occupancy', value: '87%', color: '#a78bfa' },
  ],
  quickservice: [
    { statKey: 'revenue', value: '1.2M', color: '#4ade80' },
    { statKey: 'orders', value: '312', color: '#60a5fa' },
    { statKey: 'articles', value: '24', color: '#f97316' },
    { statKey: 'avgTime', value: '4min', color: '#a78bfa' },
  ],
  bar: [
    { statKey: 'revenue', value: '680K', color: '#4ade80' },
    { statKey: 'orders', value: '189', color: '#60a5fa' },
    { statKey: 'cocktails', value: '35', color: '#f97316' },
    { statKey: 'tables', value: '18', color: '#a78bfa' },
  ],
  fastfood: [
    { statKey: 'revenue', value: '2.1M', color: '#4ade80' },
    { statKey: 'orders', value: '487', color: '#60a5fa' },
    { statKey: 'articles', value: '18', color: '#f97316' },
    { statKey: 'drive', value: '156', color: '#a78bfa' },
  ],
};

const chartValues: Record<Segment, { total: string; points: number[] }> = {
  restaurant: { total: '2 450 000 F', points: [30, 45, 38, 55, 42, 68, 52] },
  hotel: { total: '5 120 000 F', points: [60, 55, 70, 50, 75, 65, 80] },
  quickservice: { total: '3 680 000 F', points: [45, 60, 55, 70, 65, 80, 72] },
  bar: { total: '1 540 000 F', points: [35, 50, 45, 55, 60, 48, 65] },
  fastfood: { total: '4 920 000 F', points: [55, 70, 60, 85, 75, 90, 80] },
};

const avgBasket: Record<Segment, { value: string; points: number[] }> = {
  restaurant: { value: '13 100 F', points: [40, 50, 45, 55, 48, 52, 50] },
  hotel: { value: '81 300 F', points: [70, 65, 75, 68, 72, 70, 78] },
  quickservice: { value: '5 200 F', points: [45, 50, 48, 52, 55, 50, 53] },
  bar: { value: '8 700 F', points: [38, 45, 42, 50, 48, 52, 46] },
  fastfood: { value: '4 800 F', points: [42, 48, 45, 50, 52, 48, 55] },
};

// Brand-specific demo orders. Table codes + menu items kept as-is since
// they represent the real menu content of the targeted market.
const orderData: Record<
  Segment,
  {
    table: string;
    id: string;
    items: string;
    price: string;
    time: string;
    status: 'ready' | 'inProgress' | 'pending';
  }[]
> = {
  restaurant: [
    {
      table: 'T4',
      id: '#A2F4',
      items: '2x Poulet, 1x Jus',
      price: '18 500 F',
      time: '2 min',
      status: 'ready',
    },
    {
      table: 'T12',
      id: '#A2F3',
      items: '1x Ndole, 2x Biere',
      price: '14 200 F',
      time: '8 min',
      status: 'inProgress',
    },
    {
      table: 'T7',
      id: '#A2F2',
      items: '3x Pizza, 1x Coca',
      price: '22 000 F',
      time: '15 min',
      status: 'pending',
    },
    {
      table: 'T2',
      id: '#A2F1',
      items: '1x Poisson grille',
      price: '31 800 F',
      time: '22 min',
      status: 'ready',
    },
  ],
  hotel: [
    {
      table: 'Ch.201',
      id: '#H01',
      items: 'Suite junior',
      price: '85 000 F',
      time: '1 min',
      status: 'ready',
    },
    {
      table: 'Ch.105',
      id: '#H02',
      items: 'Chambre double',
      price: '45 000 F',
      time: '15 min',
      status: 'inProgress',
    },
    {
      table: 'Room',
      id: '#H03',
      items: '2x Petit-dej',
      price: '25 000 F',
      time: '30 min',
      status: 'ready',
    },
    {
      table: 'Ch.312',
      id: '#H04',
      items: 'Chambre simple',
      price: '32 000 F',
      time: '1h',
      status: 'pending',
    },
  ],
  quickservice: [
    {
      table: 'Cmd',
      id: '#Q501',
      items: '2x Burger, 1x Frites',
      price: '8 500 F',
      time: '1 min',
      status: 'ready',
    },
    {
      table: 'Cmd',
      id: '#Q502',
      items: '1x Wrap poulet',
      price: '4 200 F',
      time: '3 min',
      status: 'inProgress',
    },
    {
      table: 'Cmd',
      id: '#Q503',
      items: '3x Tacos, 2x Jus',
      price: '12 800 F',
      time: '5 min',
      status: 'pending',
    },
    {
      table: 'Cmd',
      id: '#Q504',
      items: '1x Salade, 1x Smoothie',
      price: '6 500 F',
      time: '7 min',
      status: 'ready',
    },
  ],
  bar: [
    {
      table: 'T3',
      id: '#B01',
      items: '2x Mojito, 1x Biere',
      price: '12 500 F',
      time: '2 min',
      status: 'ready',
    },
    {
      table: 'T8',
      id: '#B02',
      items: '1x Whisky, 1x Tapas',
      price: '9 800 F',
      time: '5 min',
      status: 'inProgress',
    },
    {
      table: 'Bar',
      id: '#B03',
      items: '3x Cocktail maison',
      price: '15 000 F',
      time: '8 min',
      status: 'ready',
    },
    {
      table: 'T5',
      id: '#B04',
      items: '2x Cafe, 1x Patisserie',
      price: '4 200 F',
      time: '12 min',
      status: 'pending',
    },
  ],
  fastfood: [
    {
      table: 'Borne',
      id: '#F12',
      items: '3x Menu Classic',
      price: '13 500 F',
      time: '1 min',
      status: 'ready',
    },
    {
      table: 'Drive',
      id: '#F13',
      items: '2x Menu XL, 1x Sundae',
      price: '16 200 F',
      time: '3 min',
      status: 'inProgress',
    },
    {
      table: 'Borne',
      id: '#F14',
      items: '1x Nuggets, 2x Frites',
      price: '7 800 F',
      time: '4 min',
      status: 'ready',
    },
    {
      table: 'Drive',
      id: '#F15',
      items: '4x Menu Enfant',
      price: '18 000 F',
      time: '6 min',
      status: 'pending',
    },
  ],
};

const statusColors = {
  ready: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  inProgress: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  pending: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
};

const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function MiniAreaChart({
  points,
  color,
  height = 48,
}: {
  points: number[];
  color: string;
  height?: number;
}) {
  const max = Math.max(...points);
  const w = 200;
  const h = height;
  const pad = 4;
  const coords = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (w - pad * 2),
    y: h - pad - (v / max) * (h - pad * 2),
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${h} L${coords[0].x},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniGauge({ data }: { data: { color: string }[] }) {
  const total = data.length;
  const r = 20;
  const cx = 28;
  const cy = 28;
  const strokeWidth = 8;

  return (
    <svg viewBox="0 0 56 32" className="w-full" style={{ height: 32 }}>
      {data.map((item, i) => {
        const startAngle = 180 + (i / total) * 180;
        const endAngle = 180 + ((i + 1) / total) * 180 - 2;
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
            fill="none"
            stroke={item.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export default function DashboardPreview({ segment, className }: DashboardPreviewProps) {
  const t = useTranslations('marketing.home.videoHero.preview');
  const gauge = gaugeData[segment];
  const chart = chartValues[segment];
  const basket = avgBasket[segment];
  const orders = orderData[segment];
  const brand = brandNames[segment];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-neutral-900/10 dark:shadow-black/30',
        className,
      )}
    >
      {/* Window Chrome */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
          app.attabl.com
        </span>
      </div>

      {/* App Shell */}
      <div className="flex" style={{ height: 340 }}>
        {/* Sidebar */}
        <div className="hidden sm:flex w-14 flex-col items-center gap-1.5 border-r border-app-border bg-app-card py-3 px-1">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <span className="text-[10px] font-black text-accent">A</span>
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                i === 0 && 'bg-accent-muted',
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
          <div className="flex-1" />
          <div className="flex h-7 w-7 items-center justify-center rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/30" />
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 flex-col bg-app-bg min-w-0">
          {/* Top Bar */}
          <div className="flex h-8 items-center justify-between border-b border-app-border px-3 shrink-0">
            <span className="text-[10px] text-app-text-muted">{t('dashboard')}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-app-text-muted">14:32</span>
              <div className="h-5 w-5 rounded-full bg-app-elevated" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-2 sm:p-3">
            {/* Greeting */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-[10px] font-bold text-app-text">
                {t('greeting')} {brand}
              </span>
              <span className="text-[10px] text-app-text-muted hidden sm:inline">{t('date')}</span>
            </div>

            {/* Two columns */}
            <div className="flex gap-2 h-[calc(100%-24px)]">
              {/* Left Column */}
              <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                {/* Stats Gauge Card */}
                <div className="flex items-center gap-2 rounded-lg border border-app-border bg-app-card px-2 py-1.5">
                  <div className="shrink-0 w-14">
                    <MiniGauge data={gauge} />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-0.5 min-w-0">
                    {gauge.map((g) => (
                      <div key={g.statKey} className="flex items-center gap-1 min-w-0">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="text-[10px] text-app-text-muted truncate">
                          {t(`stats.${g.statKey}`)}
                        </span>
                        <span className="text-[10px] font-bold text-app-text tabular-nums ml-auto shrink-0">
                          {g.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main Chart (Area Chart like real dashboard) */}
                <div className="flex-1 rounded-lg border border-app-border bg-app-card p-2 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-1 shrink-0">
                    <div>
                      <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
                        {t('revenue7Days')}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-[11px] font-black text-app-text tabular-nums">
                          {chart.total}
                        </span>
                      </div>
                    </div>
                    <div className="flex rounded bg-app-elevated p-0.5 shrink-0">
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                        {t('revenue')}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold text-app-text-muted">
                        {t('ordersShort')}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MiniAreaChart points={chart.points} color="#4ade80" height={60} />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    {dayKeys.map((d) => (
                      <span key={d} className="text-[10px] text-app-text-muted flex-1 text-center">
                        {t(`days.${d}`)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Avg Basket (mini blue chart like real dashboard) */}
                <div className="rounded-lg border border-app-border bg-app-card p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
                      {t('avgBasket')}
                    </span>
                    <span className="text-[10px] font-black text-app-text tabular-nums">
                      {basket.value}
                    </span>
                  </div>
                  <MiniAreaChart points={basket.points} color="#3b82f6" height={28} />
                </div>

                {/* Quick Action Buttons */}
                <div className="hidden sm:flex gap-1">
                  {(['qrCodes', 'reports', 'stock'] as const).map((key) => (
                    <div
                      key={key}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 border border-app-border rounded-lg"
                    >
                      <div className="h-2 w-2 rounded-sm bg-app-text-muted/20" />
                      <span className="text-[10px] text-app-text-secondary font-medium">
                        {t(`quickActions.${key}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column - Orders */}
              <div className="w-[42%] flex flex-col rounded-lg border border-app-border overflow-hidden bg-app-card">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-app-border shrink-0">
                  <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
                    {t('orders')}
                  </span>
                  <span className="text-[10px] font-semibold text-accent">{t('viewAll')}</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  {orders.map((order, i) => {
                    const sc = statusColors[order.status];
                    return (
                      <div
                        key={order.id}
                        className={cn(
                          'flex items-start gap-1.5 px-2 py-1.5',
                          i < orders.length - 1 && 'border-b border-app-border',
                        )}
                      >
                        <div className="relative shrink-0 mt-0.5">
                          <div className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-app-text font-mono">
                              {order.table}
                            </span>
                            <span className="text-[10px] text-app-text-muted">{order.id}</span>
                            <span
                              className={cn(
                                'text-[10px] font-bold px-1 py-0.5 rounded-full',
                                sc.bg,
                                sc.text,
                              )}
                            >
                              {t(`status.${order.status}`)}
                            </span>
                          </div>
                          <p className="text-[10px] text-app-text-muted mt-0.5 truncate">
                            {order.items}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-[10px] font-bold text-app-text tabular-nums block">
                            {order.price}
                          </span>
                          <span className="text-[10px] text-app-text-muted">{order.time}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
