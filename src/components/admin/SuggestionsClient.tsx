'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Plus, Trash2, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { SuggestionType } from '@/types/inventory.types';

interface SuggestionsClientProps {
  tenantId: string;
}

interface MenuItem {
  id: string;
  name: string;
}

interface Suggestion {
  id: string;
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
  display_order: number;
  is_active: boolean;
  // Joined
  menu_item?: { name: string };
  suggested_item?: { name: string };
}

export default function SuggestionsClient({ tenantId }: SuggestionsClientProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [sourceItemId, setSourceItemId] = useState('');
  const [targetItemId, setTargetItemId] = useState('');
  const [suggestionType, setSuggestionType] = useState<SuggestionType>('pairing');
  const [description, setDescription] = useState('');

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const supabase = createClient();

  const SUGGESTION_TYPES: { value: SuggestionType; label: string; emoji: string; color: string }[] =
    [
      {
        value: 'pairing',
        label: t('pairing'),
        emoji: '\uD83C\uDF77',
        color: 'bg-purple-100 text-purple-700',
      },
      {
        value: 'upsell',
        label: t('upsell'),
        emoji: '\uD83D\uDCA1',
        color: 'bg-amber-100 text-amber-700',
      },
      {
        value: 'alternative',
        label: t('alternativeItem'),
        emoji: '\uD83D\uDD04',
        color: 'bg-blue-100 text-blue-700',
      },
    ];

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, suggestionsRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('is_available', true)
          .order('name'),
        supabase
          .from('item_suggestions')
          .select(
            '*, menu_item:menu_items!item_suggestions_menu_item_id_fkey(name), suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(name)',
          )
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('display_order'),
      ]);

      if (itemsRes.data) setMenuItems(itemsRes.data as MenuItem[]);
      if (suggestionsRes.data) setSuggestions(suggestionsRes.data as Suggestion[]);
    } catch {
      toast({ title: tc('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!sourceItemId || !targetItemId) {
      toast({ title: t('selectBothDishes'), variant: 'destructive' });
      return;
    }
    if (sourceItemId === targetItemId) {
      toast({ title: t('dishesMustDiffer'), variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.from('item_suggestions').insert({
        tenant_id: tenantId,
        menu_item_id: sourceItemId,
        suggested_item_id: targetItemId,
        suggestion_type: suggestionType,
        description: description.trim() || null,
        display_order: suggestions.length,
      });

      if (error) throw error;
      toast({ title: t('suggestionAdded') });
      setShowAdd(false);
      setSourceItemId('');
      setTargetItemId('');
      setDescription('');
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('item_suggestions')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('suggestionDeleted') });
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const filtered = suggestions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.menu_item?.name.toLowerCase().includes(q) ||
      s.suggested_item?.name.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">{tc('loading')}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Lightbulb className="w-6 h-6" />
            {t('suggestions')}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {t('activeSuggestions', { count: suggestions.length })}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('addSuggestion')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
        <Input
          placeholder={t('searchDish')}
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Suggestions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((suggestion) => {
          const typeConfig = SUGGESTION_TYPES.find((st) => st.value === suggestion.suggestion_type);
          return (
            <div
              key={suggestion.id}
              className="bg-white rounded-xl border border-neutral-200 p-4 transition-shadow"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                    typeConfig?.color || 'bg-neutral-100 text-neutral-600',
                  )}
                >
                  {typeConfig?.emoji} {typeConfig?.label}
                </span>
                <button
                  onClick={() => handleDelete(suggestion.id)}
                  className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-sm font-semibold text-neutral-900">
                  {suggestion.menu_item?.name || tc('unknown')}
                </p>
                <p className="text-xs text-neutral-400">{tc('suggests')}</p>
                <p className="text-sm font-semibold text-primary">
                  {suggestion.suggested_item?.name || tc('unknown')}
                </p>
              </div>

              {suggestion.description && (
                <p className="mt-2 text-xs text-neutral-500 italic">
                  &ldquo;{suggestion.description}&rdquo;
                </p>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-400">
            <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t('noSuggestions')}</p>
            <p className="text-xs mt-1">{t('addServerAdvice')}</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">{t('newSuggestion')}</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('sourceDish')}
                </label>
                <select
                  value={sourceItemId}
                  onChange={(e) => setSourceItemId(e.target.value)}
                  className="w-full h-10 px-3 border border-neutral-200 rounded-lg text-sm bg-white"
                >
                  <option value="">{tc('selectPlaceholder')}</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('suggestionType')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SUGGESTION_TYPES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setSuggestionType(st.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all',
                        suggestionType === st.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50',
                      )}
                    >
                      <span>{st.emoji}</span>
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('suggestedDish')}
                </label>
                <select
                  value={targetItemId}
                  onChange={(e) => setTargetItemId(e.target.value)}
                  className="w-full h-10 px-3 border border-neutral-200 rounded-lg text-sm bg-white"
                >
                  <option value="">{tc('selectPlaceholder')}</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('serverAdvice')}
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('serverAdvicePlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleAdd}>{tc('add')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
