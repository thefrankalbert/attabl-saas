'use client';

import { useCallback, useId } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Plus,
  Folder,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Building2,
  Globe,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  selectedIds: Set<string>;
  onToggleSelect: (menuId: string) => void;
  onEdit: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
  onToggle: (menu: Menu) => void;
  onAddChild: (parentId: string) => void;
  onReorder: (from: number, to: number) => void;
  onCreateFirst: () => void;
}

interface MenuRowProps {
  menu: Menu;
  tenantSlug: string;
  venues: Venue[];
  isSelected: boolean;
  /** Hide venue badge when row is already under a venue section header */
  showVenueBadge?: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddChild: () => void;
}

// ─── MenuRow Component ──────────────────────────────────

function MenuRow({
  menu,
  tenantSlug,
  venues,
  isSelected,
  showVenueBadge = true,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
}: MenuRowProps) {
  const t = useTranslations('menus');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menu.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  const childCount = menu.children?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
        isDragging && 'bg-app-bg shadow-sm',
      )}
    >
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="w-4 h-4 rounded border-app-border accent-accent focus:ring-accent shrink-0 cursor-pointer"
      />

      {/* Drag handle */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="touch-none cursor-grab active:cursor-grabbing focus:outline-none shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-app-text-muted" />
      </button>

      {/* Name + meta */}
      <Link
        href={`/sites/${tenantSlug}/admin/menus/${menu.id}`}
        className="flex-1 min-w-0 flex items-center gap-2"
      >
        <span className="font-medium text-sm text-app-text hover:underline break-words">
          {menu.name}
        </span>
        {showVenueBadge && menu.venue && (
          <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
            <Building2 className="w-2.5 h-2.5" />
            {menu.venue.name}
          </Badge>
        )}
        {!menu.venue_id && venues.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 shrink-0 border-accent/15 text-accent bg-accent/5"
          >
            <Globe className="w-2.5 h-2.5" />
            {t('sharedMenuBadge')}
          </Badge>
        )}
        {childCount > 0 && (
          <span className="text-xs text-app-text-muted shrink-0">
            {t('subMenuCount', { count: childCount })}
          </span>
        )}
      </Link>

      {/* Active toggle */}
      <button
        onClick={onToggle}
        className={cn(
          'px-2 py-0.5 rounded-full text-xs font-semibold border transition-all shrink-0',
          menu.is_active
            ? 'bg-status-success-bg text-status-success border-status-success/20'
            : 'bg-app-bg text-app-text-secondary border-app-border',
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

      {/* Actions */}
      <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddChild}
          title={t('addSubMenu')}
          className="h-8 w-8 p-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 w-8 p-0">
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
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
  selectedIds,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
  onReorder,
  onCreateFirst,
}: MenusTableProps) {
  const t = useTranslations('menus');
  const dndId = useId();

  // @dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = menus.findIndex((m) => m.id === active.id);
      const newIndex = menus.findIndex((m) => m.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      onReorder(oldIndex, newIndex);
    },
    [menus, onReorder],
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {/* Loading state */}
      {loading && (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-app-card border-b border-app-border animate-pulse" />
          ))}
        </div>
      )}

      {/* Standalone menus */}
      {filteredStandalone.length > 0 && (
        <SortableContext
          items={filteredStandalone.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {filteredStandalone.map((menu) => (
            <MenuRow
              key={menu.id}
              menu={menu}
              tenantSlug={tenantSlug}
              venues={venues}
              isSelected={selectedIds.has(menu.id)}
              onToggleSelect={() => onToggleSelect(menu.id)}
              onEdit={() => onEdit(menu)}
              onDelete={() => onDelete(menu)}
              onToggle={() => onToggle(menu)}
              onAddChild={() => onAddChild(menu.id)}
            />
          ))}
        </SortableContext>
      )}

      {/* Menus by venue — flat list, no venue section headers */}
      {Object.entries(menusByVenue).map(([venueId, venueMenus]) => {
        const filtered = venueMenus.filter((m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        if (filtered.length === 0) return null;

        return (
          <SortableContext
            key={venueId}
            items={filtered.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {filtered.map((menu) => (
              <MenuRow
                key={menu.id}
                menu={menu}
                tenantSlug={tenantSlug}
                venues={venues}
                isSelected={selectedIds.has(menu.id)}
                onToggleSelect={() => onToggleSelect(menu.id)}
                onEdit={() => onEdit(menu)}
                onDelete={() => onDelete(menu)}
                onToggle={() => onToggle(menu)}
                onAddChild={() => onAddChild(menu.id)}
              />
            ))}
          </SortableContext>
        );
      })}

      {/* Empty state */}
      {menus.length === 0 && !loading && (
        <div className="p-12 text-center">
          <div className="w-14 h-14 bg-app-elevated rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-7 h-7 text-app-text-muted" />
          </div>
          <h3 className="text-base font-bold text-app-text">{t('noMenus')}</h3>
          <p className="text-sm text-app-text-secondary mt-2">{t('noMenusDesc')}</p>
          <Button onClick={onCreateFirst} variant="default" className="mt-4">
            {t('createMenu')}
          </Button>
        </div>
      )}
    </DndContext>
  );
}
