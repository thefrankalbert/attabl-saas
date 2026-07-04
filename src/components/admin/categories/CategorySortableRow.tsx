'use client';

import { GripVertical, Utensils, Edit2, Trash2, Wine, Shuffle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CategoryWithCount } from './types';

interface SortableRowProps {
  cat: CategoryWithCount;
  onEdit: (cat: CategoryWithCount) => void;
  onDelete: (cat: CategoryWithCount) => void;
}

export function SortableRow({ cat, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
        isDragging && 'bg-app-bg shadow-sm',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        ref={setActivatorNodeRef}
        className="touch-none cursor-grab active:cursor-grabbing focus:outline-none p-1 -m-1 h-auto w-auto rounded hover:bg-app-bg transition-colors"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-app-text-muted" />
      </Button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-app-text text-sm">{cat.name}</p>
      </div>
      {cat.preparation_zone && cat.preparation_zone !== 'kitchen' && (
        <div className="flex items-center gap-1 rounded-[0.625rem] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium normal-case text-[var(--muted-foreground)]">
          {cat.preparation_zone === 'bar' ? (
            <Wine className="w-3 h-3" />
          ) : (
            <Shuffle className="w-3 h-3" />
          )}
          {cat.preparation_zone}
        </div>
      )}
      <div
        className="flex items-center gap-1.5 text-xs text-app-text-muted"
        title={`${cat.items_count || 0} plats`}
      >
        <Utensils className="w-3 h-3" />
        <span className="font-medium tabular-nums">{cat.items_count || 0}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(cat)}
          className="h-9 w-9 p-0 text-accent hover:text-accent hover:bg-accent/10"
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(cat)}
          title="Supprimer"
          className="h-9 w-9 p-0 text-[var(--destructive)] hover:bg-[var(--accent)]"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
