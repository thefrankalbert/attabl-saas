'use client';

import { Lightbulb, Trash2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { Suggestion, SuggestionTypeConfig } from './types';

interface SuggestionsListProps {
  items: Suggestion[];
  suggestionTypes: SuggestionTypeConfig[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function SuggestionsList({
  items,
  suggestionTypes,
  selectedIds,
  onToggleSelect,
  onDelete,
}: SuggestionsListProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-2 sm:mt-4">
      {items.length > 0 ? (
        <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
          {items.map((suggestion) => {
            const typeConfig = suggestionTypes.find(
              (st) => st.value === suggestion.suggestion_type,
            );
            return (
              <div
                key={suggestion.id}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
                  selectedIds.has(suggestion.id) && 'bg-accent/5',
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Select"
                  onClick={() => onToggleSelect(suggestion.id)}
                  className="text-app-text-muted hover:text-app-text-secondary transition-colors shrink-0 h-auto w-auto p-1"
                >
                  {selectedIds.has(suggestion.id) ? (
                    <CheckSquare className="w-4 h-4 text-accent" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </Button>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-[0.625rem] text-[10px] font-medium shrink-0',
                    typeConfig?.color || 'border border-[var(--border)] text-app-text-secondary',
                  )}
                >
                  {typeConfig?.emoji} {typeConfig?.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app-text break-words">
                    <span className="font-medium">
                      {suggestion.menu_item?.name || tc('unknown')}
                    </span>
                    <span className="text-app-text-muted mx-2">→</span>
                    <span className="font-medium text-accent">
                      {suggestion.suggested_item?.name || tc('unknown')}
                    </span>
                  </p>
                  {suggestion.description && (
                    <p className="text-xs text-app-text-muted break-words mt-0.5 italic">
                      {suggestion.description}
                    </p>
                  )}
                </div>
                <div className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-[var(--destructive)] hover:bg-[var(--accent)]"
                    title="Supprimer"
                    onClick={() => onDelete(suggestion.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
          <div className="w-16 h-16 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-8 h-8 text-app-text-muted" />
          </div>
          <p className="text-lg font-bold text-app-text">{t('noSuggestions')}</p>
          <p className="text-sm text-app-text-secondary mt-2">{t('addServerAdvice')}</p>
        </div>
      )}
    </div>
  );
}
