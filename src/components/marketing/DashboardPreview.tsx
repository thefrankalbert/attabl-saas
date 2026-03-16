'use client';

import { cn } from '@/lib/utils';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

interface DashboardPreviewProps {
  segment: Segment;
  className?: string;
}

// --- Segment-specific data ---

const greetings: Record<Segment, string> = {
  restaurant: 'Bon après-midi, Le Jardin',
  boutique: 'Bon après-midi, Sahel Mode',
  salon: 'Bon après-midi, Salon Elegance',
  hotel: 'Bon après-midi, Prestige Hotel',
};

const gaugeData: Record<Segment, { label: string; value: string; color: string }[]> = {
  restaurant: [
    { label: 'Revenu', value: '847K', color: '#4ade80' },
    { label: 'Commandes', value: '152', color: '#60a5fa' },
    { label: 'Articles', value: '48', color: '#f97316' },
    { label: 'Tables', value: '24', color: '#a78bfa' },
  ],
  boutique: [
    { label: 'Ventes', value: '1.2M', color: '#4ade80' },
    { label: 'Transactions', value: '89', color: '#60a5fa' },
    { label: 'Produits', value: '234', color: '#f97316' },
    { label: 'Clients', value: '67', color: '#a78bfa' },
  ],
  salon: [
    { label: 'Revenu', value: '380K', color: '#4ade80' },
    { label: 'RDV', value: '42', color: '#60a5fa' },
    { label: 'Prestations', value: '18', color: '#f97316' },
    { label: 'Coiffeurs', value: '6', color: '#a78bfa' },
  ],
  hotel: [
    { label: 'Revenu', value: '2.8M', color: '#4ade80' },
    { label: 'Check-ins', value: '31', color: '#60a5fa' },
    { label: 'Chambres', value: '42', color: '#f97316' },
    { label: 'Occup.', value: '87%', color: '#a78bfa' },
  ],
};

const chartValues: Record<Segment, { total: string; points: number[] }> = {
  restaurant: { total: '2 450 000 F', points: [30, 45, 38, 55, 42, 68, 52] },
  boutique: { total: '1 840 000 F', points: [50, 42, 65, 48, 55, 70, 38] },
  salon: { total: '980 000 F', points: [25, 35, 40, 30, 55, 45, 50] },
  hotel: { total: '5 120 000 F', points: [60, 55, 70, 50, 75, 65, 80] },
};

const avgBasket: Record<Segment, { value: string; points: number[] }> = {
  restaurant: { value: '13 100 F', points: [40, 50, 45, 55, 48, 52, 50] },
  boutique: { value: '15 500 F', points: [55, 48, 60, 52, 58, 50, 55] },
  salon: { value: '10 400 F', points: [35, 42, 38, 45, 40, 48, 42] },
  hotel: { value: '81 300 F', points: [70, 65, 75, 68, 72, 70, 78] },
};

const orderData: Record<
  Segment,
  {
    table: string;
    id: string;
    items: string;
    price: string;
    time: string;
    status: 'success' | 'info' | 'warning';
  }[]
> = {
  restaurant: [
    {
      table: 'T4',
      id: '#A2F4',
      items: '2x Poulet, 1x Jus',
      price: '18 500 F',
      time: '2 min',
      status: 'success',
    },
    {
      table: 'T12',
      id: '#A2F3',
      items: '1x Ndole, 2x Biere',
      price: '14 200 F',
      time: '8 min',
      status: 'info',
    },
    {
      table: 'T7',
      id: '#A2F2',
      items: '3x Pizza, 1x Coca',
      price: '22 000 F',
      time: '15 min',
      status: 'warning',
    },
    {
      table: 'T2',
      id: '#A2F1',
      items: '1x Poisson grille',
      price: '31 800 F',
      time: '22 min',
      status: 'success',
    },
  ],
  boutique: [
    {
      table: '#301',
      id: '#B301',
      items: '1x Robe wax',
      price: '15 000 F',
      time: '5 min',
      status: 'success',
    },
    {
      table: '#302',
      id: '#B302',
      items: '2x Sac cuir',
      price: '45 000 F',
      time: '12 min',
      status: 'success',
    },
    {
      table: '#303',
      id: '#B303',
      items: '3x Bijoux argent',
      price: '26 700 F',
      time: '25 min',
      status: 'info',
    },
    {
      table: '#304',
      id: '#B304',
      items: '1x Chaussures',
      price: '18 500 F',
      time: '1h',
      status: 'success',
    },
  ],
  salon: [
    {
      table: 'Marie',
      id: '#S01',
      items: 'Coupe + Coloration',
      price: '15 000 F',
      time: '3 min',
      status: 'info',
    },
    {
      table: 'Aisha',
      id: '#S02',
      items: 'Tresses',
      price: '12 000 F',
      time: '10 min',
      status: 'warning',
    },
    {
      table: 'Paul',
      id: '#S03',
      items: 'Coupe homme',
      price: '3 500 F',
      time: '20 min',
      status: 'success',
    },
    {
      table: 'Fatou',
      id: '#S04',
      items: 'Soin cheveux',
      price: '8 000 F',
      time: '35 min',
      status: 'success',
    },
  ],
  hotel: [
    {
      table: 'Ch.201',
      id: '#H01',
      items: 'Suite junior',
      price: '85 000 F',
      time: '1 min',
      status: 'success',
    },
    {
      table: 'Ch.105',
      id: '#H02',
      items: 'Chambre double',
      price: '45 000 F',
      time: '15 min',
      status: 'info',
    },
    {
      table: 'Room',
      id: '#H03',
      items: '2x Petit-dej',
      price: '25 000 F',
      time: '30 min',
      status: 'success',
    },
    {
      table: 'Ch.312',
      id: '#H04',
      items: 'Chambre simple',
      price: '32 000 F',
      time: '1h',
      status: 'warning',
    },
  ],
};

const statusColors = {
  success: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  info: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  warning: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
};

const statusLabels = { success: 'Pret', info: 'En cours', warning: 'En attente' };

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// --- SVG mini area chart (reproduces the AreaChart from real dashboard) ---
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

// --- Semi-circular gauge (reproduces the PieChart gauge from real dashboard) ---
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

// --- Main Component ---

export default function DashboardPreview({ segment, className }: DashboardPreviewProps) {
  const gauge = gaugeData[segment];
  const chart = chartValues[segment];
  const basket = avgBasket[segment];
  const orders = orderData[segment];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-200 shadow-2xl shadow-neutral-900/10',
        className,
      )}
    >
      {/* Window Chrome */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[9px] font-medium text-neutral-400">app.attabl.com</span>
      </div>

      {/* App Shell */}
      <div className="flex" style={{ height: 340 }}>
        {/* Sidebar */}
        <div className="hidden sm:flex w-14 flex-col items-center gap-1.5 border-r border-app-border bg-app-card py-3 px-1">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <span className="text-[9px] font-black text-accent">A</span>
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
            <span className="text-[9px] text-app-text-muted">Dashboard</span>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-app-text-muted">14:32</span>
              <div className="h-5 w-5 rounded-full bg-app-elevated" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-2 sm:p-3">
            {/* Greeting */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-app-text">
                {greetings[segment]}
              </span>
              <span className="text-[8px] text-app-text-muted hidden sm:inline">
                Dimanche 16 mars
              </span>
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
                      <div key={g.label} className="flex items-center gap-1 min-w-0">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="text-[7px] text-app-text-muted truncate">{g.label}</span>
                        <span className="text-[7px] font-bold text-app-text tabular-nums ml-auto shrink-0">
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
                      <span className="text-[7px] font-semibold text-app-text-muted uppercase tracking-wider">
                        Revenu - 7 jours
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-[11px] font-black text-app-text tabular-nums">
                          {chart.total}
                        </span>
                      </div>
                    </div>
                    <div className="flex rounded bg-app-elevated p-0.5 shrink-0">
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[6px] font-bold text-accent-text">
                        Revenu
                      </span>
                      <span className="px-1.5 py-0.5 text-[6px] font-bold text-app-text-muted">
                        Cmd
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MiniAreaChart points={chart.points} color="#4ade80" height={60} />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    {days.map((d) => (
                      <span key={d} className="text-[5px] text-app-text-muted flex-1 text-center">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Avg Basket (mini blue chart like real dashboard) */}
                <div className="rounded-lg border border-app-border bg-app-card p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[7px] font-semibold text-app-text-muted uppercase tracking-wider">
                      Panier moyen
                    </span>
                    <span className="text-[10px] font-black text-app-text tabular-nums">
                      {basket.value}
                    </span>
                  </div>
                  <MiniAreaChart points={basket.points} color="#3b82f6" height={28} />
                </div>

                {/* Quick Action Buttons */}
                <div className="hidden sm:flex gap-1">
                  {['QR Codes', 'Rapports', 'Stock'].map((label) => (
                    <div
                      key={label}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 border border-app-border rounded-lg"
                    >
                      <div className="h-2 w-2 rounded-sm bg-app-text-muted/20" />
                      <span className="text-[7px] text-app-text-secondary font-medium">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column - Orders */}
              <div className="w-[42%] flex flex-col rounded-lg border border-app-border overflow-hidden bg-app-card">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-app-border shrink-0">
                  <span className="text-[7px] font-semibold text-app-text-muted uppercase tracking-wider">
                    Commandes
                  </span>
                  <span className="text-[7px] font-semibold text-accent">Tout voir</span>
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
                            <span className="text-[8px] font-bold text-app-text font-mono">
                              {order.table}
                            </span>
                            <span className="text-[7px] text-app-text-muted">{order.id}</span>
                            <span
                              className={cn(
                                'text-[6px] font-bold px-1 py-0.5 rounded-full',
                                sc.bg,
                                sc.text,
                              )}
                            >
                              {statusLabels[order.status]}
                            </span>
                          </div>
                          <p className="text-[6px] text-app-text-muted mt-0.5 truncate">
                            {order.items}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-[7px] font-bold text-app-text tabular-nums block">
                            {order.price}
                          </span>
                          <span className="text-[6px] text-app-text-muted">{order.time}</span>
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
