import {
  Bell,
  BedDouble,
  BookOpen,
  ChefHat,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  Globe,
  HandCoins,
  LayoutGrid,
  Package,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Star,
  Table,
  TrendingUp,
  Truck,
  Users,
  Utensils,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';

export type FeatureCategory = {
  id: string;
  media?: { src: string; w: number; h: number };
  items: { k: string; Icon: LucideIcon }[];
};

/** Structural definition (icons, media, item order); all text lives in marketing.features.categories.* */
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    id: 'menu',
    media: { src: '/marketing/sc-orders.png', w: 2403, h: 1617 },
    items: [
      { k: 'qr', Icon: QrCode },
      { k: 'brand', Icon: LayoutGrid },
      { k: 'dine', Icon: Utensils },
      { k: 'bag', Icon: ShoppingBag },
      { k: 'truck', Icon: Truck },
      { k: 'bed', Icon: BedDouble },
    ],
  },
  {
    id: 'caisse',
    items: [
      { k: 'card', Icon: CreditCard },
      { k: 'coins', Icon: Coins },
      { k: 'tip', Icon: HandCoins },
      { k: 'offline', Icon: WifiOff },
      { k: 'daily', Icon: ShieldCheck },
    ],
  },
  {
    id: 'cuisine',
    media: { src: '/marketing/sc-kds.png', w: 2360, h: 1640 },
    items: [
      { k: 'kds', Icon: ChefHat },
      { k: 'tables', Icon: Table },
      { k: 'staff', Icon: Users },
      { k: 'recipes', Icon: BookOpen },
    ],
  },
  {
    id: 'stock',
    media: { src: '/marketing/app-inventaire-full.png', w: 2344, h: 1348 },
    items: [
      { k: 'stock', Icon: Package },
      { k: 'alerts', Icon: Bell },
      { k: 'suppliers', Icon: ClipboardList },
      { k: 'cost', Icon: BookOpen },
    ],
  },
  {
    id: 'rapports',
    items: [
      { k: 'dashboard', Icon: TrendingUp },
      { k: 'reports', Icon: FileText },
      { k: 'bestsellers', Icon: Star },
      { k: 'multivenue', Icon: Globe },
    ],
  },
  {
    id: 'equipe',
    items: [
      { k: 'roles', Icon: Users },
      { k: 'multivenue', Icon: Globe },
      { k: 'unlimited', Icon: LayoutGrid },
      { k: 'ownership', Icon: ShieldCheck },
    ],
  },
];
