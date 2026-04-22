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
  secondaryFeatured?: boolean;
}

// ─── Tile configurations per establishment type ─────────

const RESTAURANT_TILES: TileConfig[] = [
  { id: 'pos', icon: Laptop, labelKey: 'navPos', path: '/pos', featured: true },
  {
    id: 'kitchen',
    icon: ChefHat,
    labelKey: 'navKitchen',
    path: '/kitchen',
    secondaryFeatured: true,
  },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
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
  {
    id: 'kitchen',
    icon: ChefHat,
    labelKey: 'navKitchen',
    path: '/kitchen',
    secondaryFeatured: true,
  },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
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
  {
    id: 'kitchen',
    icon: ChefHat,
    labelKey: 'navKitchen',
    path: '/kitchen',
    secondaryFeatured: true,
  },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
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
  {
    id: 'kitchen',
    icon: ChefHat,
    labelKey: 'navKitchen',
    path: '/kitchen',
    secondaryFeatured: true,
  },
  { id: 'orders', icon: ShoppingBag, labelKey: 'navOrders', path: '/orders' },
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

  const featuredTiles = tiles.filter((tile) => tile.featured || tile.secondaryFeatured);
  const regularTiles = tiles.filter((tile) => !tile.featured && !tile.secondaryFeatured);

  // Calculate grid columns for regular tiles based on count
  const cols =
    regularTiles.length <= 6 ? 3 : regularTiles.length <= 8 ? 4 : regularTiles.length <= 12 ? 3 : 4;

  return (
    <div className="flex-1 flex flex-col @md:flex-row gap-3 min-h-0 overflow-hidden">
      {/* ━━━ Left: Featured tiles (POS + Kitchen) - full height ━━━ */}
      {featuredTiles.length > 0 && (
        <div className="shrink-0 flex @md:flex-col gap-3 @md:w-52 @lg:w-56">
          {featuredTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.id}
                href={`${basePath}${tile.path}`}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-2.5',
                  'rounded-xl border transition-colors duration-150',
                  'active:scale-[0.97] touch-manipulation min-h-[80px]',
                  tile.featured
                    ? 'bg-accent border-accent/20 hover:border-accent/40'
                    : 'bg-accent-muted border-accent/15 hover:border-accent/25 hover:bg-accent-muted',
                )}
              >
                <Icon
                  className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8',
                    tile.featured ? 'text-accent-text' : 'text-accent',
                  )}
                  strokeWidth={1.5}
                />
                <span
                  className={cn(
                    'text-sm font-semibold text-center leading-tight px-2',
                    tile.featured ? 'text-accent-text' : 'text-accent',
                  )}
                >
                  {t(tile.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ━━━ Right: Regular tiles grid - fills remaining space ━━━ */}
      <div
        className={cn(
          'flex-1 grid gap-3 min-h-0 auto-rows-fr',
          cols === 3 && 'grid-cols-2 @sm:grid-cols-3',
          cols === 4 && 'grid-cols-2 @sm:grid-cols-3 @lg:grid-cols-4',
        )}
      >
        {regularTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.id}
              href={`${basePath}${tile.path}`}
              className="relative flex flex-col items-center justify-center gap-2 rounded-xl border border-app-border bg-app-card hover:border-app-border-hover hover:bg-app-hover transition-colors duration-150 active:scale-[0.97] touch-manipulation"
            >
              <Icon className="w-5 h-5 text-app-text-secondary" strokeWidth={1.5} />
              <span className="text-xs font-semibold text-center leading-tight px-2 text-app-text">
                {t(tile.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
