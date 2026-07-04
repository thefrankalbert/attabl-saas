export type Segment = 'restaurant' | 'hotel' | 'quickservice' | 'bar' | 'fastfood';

export type StatKey =
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

export type OrderStatus = 'ready' | 'inProgress' | 'pending';

export interface PreviewOrder {
  table: string;
  id: string;
  items: string;
  price: string;
  time: string;
  status: OrderStatus;
}

// Brand / demo display names kept in French since they represent the
// fictive African francophone establishments ATTABL targets. Not i18n.
export const brandNames: Record<Segment, string> = {
  restaurant: 'Le Jardin',
  hotel: 'Prestige Hotel',
  quickservice: 'Chez Mama',
  bar: 'Le Zinc',
  fastfood: 'Flame Burger',
};

export const gaugeData: Record<Segment, { statKey: StatKey; value: string; color: string }[]> = {
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

export const chartValues: Record<Segment, { total: string; points: number[] }> = {
  restaurant: { total: '2 450 000 F', points: [30, 45, 38, 55, 42, 68, 52] },
  hotel: { total: '5 120 000 F', points: [60, 55, 70, 50, 75, 65, 80] },
  quickservice: { total: '3 680 000 F', points: [45, 60, 55, 70, 65, 80, 72] },
  bar: { total: '1 540 000 F', points: [35, 50, 45, 55, 60, 48, 65] },
  fastfood: { total: '4 920 000 F', points: [55, 70, 60, 85, 75, 90, 80] },
};

export const avgBasket: Record<Segment, { value: string; points: number[] }> = {
  restaurant: { value: '13 100 F', points: [40, 50, 45, 55, 48, 52, 50] },
  hotel: { value: '81 300 F', points: [70, 65, 75, 68, 72, 70, 78] },
  quickservice: { value: '5 200 F', points: [45, 50, 48, 52, 55, 50, 53] },
  bar: { value: '8 700 F', points: [38, 45, 42, 50, 48, 52, 46] },
  fastfood: { value: '4 800 F', points: [42, 48, 45, 50, 52, 48, 55] },
};

// Brand-specific demo orders. Table codes + menu items kept as-is since
// they represent the real menu content of the targeted market.
export const orderData: Record<Segment, PreviewOrder[]> = {
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
      items: '1x Ndolé, 2x Bière',
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
      items: '1x Poisson grillé',
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
      items: '2x Mojito, 1x Bière',
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

export const statusColors = {
  ready: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  inProgress: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  pending: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
};

export const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
