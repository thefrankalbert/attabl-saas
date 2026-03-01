'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  ClipboardList,
  Laptop,
  ChefHat,
  Package,
  BarChart3,
  Settings,
  UserCheck,
  BookOpenCheck,
  Megaphone,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

interface TileConfig {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  path: string;
  featured?: boolean;
}

// ─── Tile configurations per establishment type ─────────
// Design language: Square-like monochrome. NO colored icon backgrounds.
// Only the featured POS tile gets the lime accent.

const RESTAURANT_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'kitchen', icon: ChefHat, labelKey: 'navKitchen', path: '/kitchen' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'service', icon: UserCheck, labelKey: 'navService', path: '/service' },
  { id: 'recipes', icon: BookOpenCheck, labelKey: 'navRecipes', path: '/recipes' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'team', icon: Users, labelKey: 'navUsers', path: '/users' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const HOTEL_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'kitchen', icon: ChefHat, labelKey: 'navKitchen', path: '/kitchen' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'service', icon: UserCheck, labelKey: 'navService', path: '/service' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'team', icon: Users, labelKey: 'navUsers', path: '/users' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const BAR_CAFE_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'service', icon: UserCheck, labelKey: 'navService', path: '/service' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const BOULANGERIE_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'recipes', icon: BookOpenCheck, labelKey: 'navRecipes', path: '/recipes' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const DARK_KITCHEN_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'kitchen', icon: ChefHat, labelKey: 'navKitchen', path: '/kitchen' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'recipes', icon: BookOpenCheck, labelKey: 'navRecipes', path: '/recipes' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const FOOD_TRUCK_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const QUICK_SERVICE_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
  { id: 'kitchen', icon: ChefHat, labelKey: 'navKitchen', path: '/kitchen' },
  { id: 'menus', icon: ClipboardList, labelKey: 'navMenus', path: '/menus' },
  { id: 'inventory', icon: Package, labelKey: 'navInventory', path: '/inventory' },
  { id: 'reports', icon: BarChart3, labelKey: 'navReports', path: '/reports' },
  { id: 'marketing', icon: Megaphone, labelKey: 'groupMarketing', path: '/announcements' },
  { id: 'settings', icon: Settings, labelKey: 'navSettings', path: '/settings' },
];

const TILE_MAP: Record<string, TileConfig[]> = {
  restaurant: RESTAURANT_TILES,
  hotel: HOTEL_TILES,
  'bar-cafe': BAR_CAFE_TILES,
  boulangerie: BOULANGERIE_TILES,
  'dark-kitchen': DARK_KITCHEN_TILES,
  'food-truck': FOOD_TRUCK_TILES,
  'quick-service': QUICK_SERVICE_TILES,
};

// ─── Component ──────────────────────────────────────────

interface AdminHomeGridProps {
  basePath: string;
  establishmentType?: string;
}

export default function AdminHomeGrid({ basePath, establishmentType }: AdminHomeGridProps) {
  const t = useTranslations('sidebar');
  const tiles = TILE_MAP[establishmentType || 'restaurant'] || RESTAURANT_TILES;

  return (
    <div className="flex-1 grid gap-3 auto-rows-fr grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Link
            key={tile.id}
            href={`${basePath}${tile.path}`}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2.5',
              'rounded-xl border transition-colors duration-150',
              'active:scale-[0.97] touch-manipulation min-h-[100px]',
              tile.featured
                ? 'col-span-2 row-span-2 bg-accent border-accent/20 hover:border-accent/40'
                : 'bg-app-card border-app-border hover:border-app-border-hover hover:bg-app-hover',
            )}
          >
            <Icon
              className={cn(
                tile.featured ? 'w-8 h-8 text-accent-text' : 'w-5 h-5 text-app-text-secondary',
              )}
              strokeWidth={1.6}
            />
            <span
              className={cn(
                'font-semibold text-center leading-tight px-2',
                tile.featured ? 'text-sm text-accent-text' : 'text-xs text-app-text',
              )}
            >
              {t(tile.labelKey)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
