'use client';

import { Plus, Search, Wand2, CheckSquare, Square, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

interface SuggestionsToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  canAutoGenerate: boolean;
  onAutoGenerate: () => void;
  generating: boolean;
  menuItemsCount: number;
  onAdd: () => void;
  hasSuggestions: boolean;
  selectedCount: number;
  filteredCount: number;
  onToggleSelectAll: () => void;
  onBulkDelete: () => void;
}

export default function SuggestionsToolbar({
  searchQuery,
  onSearchChange,
  canAutoGenerate,
  onAutoGenerate,
  generating,
  menuItemsCount,
  onAdd,
  hasSuggestions,
  selectedCount,
  filteredCount,
  onToggleSelectAll,
  onBulkDelete,
}: SuggestionsToolbarProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return (
    <div className="shrink-0 space-y-4">
      <AdminPageHeader
        title={t('suggestions')}
        actions={
          <>
            <div className="relative w-full xl:w-56 2xl:w-64 shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
              <Input
                placeholder={t('searchDish')}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            {canAutoGenerate && (
              <Button
                onClick={onAutoGenerate}
                variant="outline"
                size="sm"
                className="gap-2 h-9"
                disabled={generating || menuItemsCount === 0}
              >
                <Wand2 className="w-4 h-4" />
                {generating ? tc('loading') : t('autoGenerate')}
              </Button>
            )}
            <Button onClick={onAdd} variant="default" size="sm" className="gap-2 h-9">
              <Plus className="w-4 h-4" />
              {t('addSuggestion')}
            </Button>
          </>
        }
      />

      {/* Bulk actions */}
      {hasSuggestions && (
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleSelectAll}>
            {selectedCount === filteredCount && filteredCount > 0 ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selectedCount === filteredCount && filteredCount > 0
              ? t('deselectAll')
              : t('selectAll')}
          </Button>
          {selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              title="Supprimer"
              onClick={onBulkDelete}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
