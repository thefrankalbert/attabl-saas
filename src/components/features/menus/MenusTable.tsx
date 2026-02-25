'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Plus,
  Folder,
  ChevronRight,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Menu, Venue } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface MenusTableProps {
  tenantSlug: string;
  menus: Menu[];
  venues: Venue[];
  filteredStandalone: Menu[];
  menusByVenue: Record<string, Menu[]>;
  searchQuery: string;
  loading: boolean;
  onEdit: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
  onToggle: (menu: Menu) => void;
  onAddChild: (parentId: string) => void;
  onReorder: (from: number, to: number) => void;
  onCreateFirst: () => void;
}

interface MenuCardProps {
  menu: Menu;
  tenantSlug: string;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddChild: () => void;
  onReorder: (from: number, to: number) => void;
}

// ─── MenuCard Component ─────────────────────────────────

function MenuCard({ menu, tenantSlug, onEdit, onDelete, onToggle, onAddChild }: MenuCardProps) {
  const t = useTranslations('menus');
  return (
    <div className="bg-white rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all group">
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Folder className="w-5 h-5 text-neutral-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/sites/${tenantSlug}/admin/menus/${menu.id}`}
              className="font-semibold text-neutral-900 text-sm hover:underline truncate"
            >
              {menu.name}
            </Link>
            {menu.name_en && (
              <span className="text-xs text-neutral-400 truncate">({menu.name_en})</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {menu.venue && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Building2 className="w-2.5 h-2.5" />
                {menu.venue.name}
              </Badge>
            )}
            {menu.children && menu.children.length > 0 && (
              <span className="text-xs text-neutral-400">
                {t('subMenuCount', { count: menu.children.length })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={cn(
              'px-2 py-1 rounded-full text-xs font-semibold border transition-all',
              menu.is_active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : 'bg-neutral-100 text-neutral-500 border-neutral-200',
            )}
          >
            {menu.is_active ? (
              <>
                <ToggleRight className="w-3 h-3 inline mr-0.5" /> {t('active')}
              </>
            ) : (
              <>
                <ToggleLeft className="w-3 h-3 inline mr-0.5" /> {t('inactive')}
              </>
            )}
          </button>

          <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddChild}
              title={t('addSubMenu')}
              className="h-10 w-10 p-0 min-h-[44px] min-w-[44px]"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-10 w-10 p-0 min-h-[44px] min-w-[44px]"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-10 w-10 p-0 min-h-[44px] min-w-[44px] text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <Link href={`/sites/${tenantSlug}/admin/menus/${menu.id}`}>
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          </Link>
        </div>
      </div>

      {/* Sub-menus (children) */}
      {menu.children && menu.children.length > 0 && (
        <div className="border-t border-neutral-50 px-4 py-2 bg-neutral-50/50">
          <div className="flex flex-wrap gap-2">
            {menu.children.map((child) => (
              <span
                key={child.id}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border',
                  child.is_active
                    ? 'bg-white text-neutral-700 border-neutral-200'
                    : 'bg-neutral-100 text-neutral-400 border-neutral-200',
                )}
              >
                {child.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MenusTable Component ───────────────────────────────

export default function MenusTable({
  tenantSlug,
  menus,
  venues,
  filteredStandalone,
  menusByVenue,
  searchQuery,
  loading,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
  onReorder,
  onCreateFirst,
}: MenusTableProps) {
  const t = useTranslations('menus');

  return (
    <>
      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-white rounded-xl border border-neutral-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Standalone menus */}
      {filteredStandalone.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest px-1">
            {t('independentMenus')}
          </p>
          {filteredStandalone.map((menu, index) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              tenantSlug={tenantSlug}
              index={index}
              onEdit={() => onEdit(menu)}
              onDelete={() => onDelete(menu)}
              onToggle={() => onToggle(menu)}
              onAddChild={() => onAddChild(menu.id)}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}

      {/* Menus by venue */}
      {Object.entries(menusByVenue).map(([venueId, venueMenus]) => {
        const venue = venues.find((v) => v.id === venueId);
        const filtered = venueMenus.filter((m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        if (filtered.length === 0) return null;

        return (
          <div key={venueId} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Building2 className="w-4 h-4 text-neutral-400" />
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                {venue?.name || t('space')}
              </p>
            </div>
            {filtered.map((menu, index) => (
              <MenuCard
                key={menu.id}
                menu={menu}
                tenantSlug={tenantSlug}
                index={index}
                onEdit={() => onEdit(menu)}
                onDelete={() => onDelete(menu)}
                onToggle={() => onToggle(menu)}
                onAddChild={() => onAddChild(menu.id)}
                onReorder={onReorder}
              />
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {menus.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-neutral-100 p-12 text-center">
          <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-base font-bold text-neutral-900">{t('noMenus')}</h3>
          <p className="text-sm text-neutral-500 mt-2">{t('noMenusDesc')}</p>
          <Button onClick={onCreateFirst} variant="lime" className="mt-4">
            {t('createMenu')}
          </Button>
        </div>
      )}
    </>
  );
}
