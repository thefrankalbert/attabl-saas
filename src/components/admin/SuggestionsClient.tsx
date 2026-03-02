'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Plus, Trash2, Search, Wand2, CheckSquare, Square, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import AdminModal from '@/components/admin/AdminModal';
import type { SuggestionType } from '@/types/inventory.types';
import { generateAndSaveSuggestions } from '@/services/suggestion.service';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

interface SuggestionsClientProps {
  tenantId: string;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionStatus?: SubscriptionStatus | null;
  trialEndsAt?: string | null;
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

export default function SuggestionsClient({
  tenantId,
  subscriptionPlan,
  subscriptionStatus,
  trialEndsAt,
}: SuggestionsClientProps) {
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const supabase = createClient();
  const [generating, setGenerating] = useState(false);
  const canAutoGenerate = canAccessFeature(
    'autoSuggestions',
    subscriptionPlan,
    subscriptionStatus,
    trialEndsAt,
  );

  const SUGGESTION_TYPES: { value: SuggestionType; label: string; emoji: string; color: string }[] =
    [
      {
        value: 'pairing',
        label: t('pairing'),
        emoji: '\uD83C\uDF77',
        color: 'bg-purple-500/10 text-purple-500',
      },
      {
        value: 'upsell',
        label: t('upsell'),
        emoji: '\uD83D\uDCA1',
        color: 'bg-amber-500/10 text-amber-500',
      },
      {
        value: 'alternative',
        label: t('alternativeItem'),
        emoji: '\uD83D\uDD04',
        color: 'bg-blue-500/10 text-blue-500',
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

  const handleAutoGenerate = async () => {
    setGenerating(true);
    try {
      const count = await generateAndSaveSuggestions(supabase, tenantId);
      toast({ title: t('suggestionsGenerated', { count }) });
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { error } = await supabase
        .from('item_suggestions')
        .update({ is_active: false })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast({ title: t('suggestionsDeleted', { count: selectedIds.size }) });
      setSelectedIds(new Set());
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
    return <div className="p-8 text-center text-app-text-secondary">{tc('loading')}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-text flex items-center gap-2">
            <Lightbulb className="w-6 h-6" />
            {t('suggestions')}
          </h1>
          <p className="text-sm text-app-text-secondary mt-1">
            {t('activeSuggestions', { count: suggestions.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAutoGenerate && (
            <Button
              onClick={handleAutoGenerate}
              variant="outline"
              className="gap-2"
              disabled={generating || menuItems.length === 0}
            >
              <Wand2 className="w-4 h-4" />
              {generating ? tc('loading') : t('autoGenerate')}
            </Button>
          )}
          <Button onClick={() => setShowAdd(true)} variant="default" className="gap-2">
            <Plus className="w-4 h-4" />
            {t('addSuggestion')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
        <Input
          placeholder={t('searchDish')}
          className="pl-9 rounded-lg focus-visible:ring-accent"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Bulk actions */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleSelectAll}>
            {selectedIds.size === filtered.length && filtered.length > 0 ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selectedIds.size === filtered.length && filtered.length > 0
              ? t('deselectAll')
              : t('selectAll')}
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleBulkDelete}>
              <XCircle className="w-4 h-4" />
              {t('deleteSelected', { count: selectedIds.size })}
            </Button>
          )}
        </div>
      )}

      {/* Suggestions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((suggestion) => {
          const typeConfig = SUGGESTION_TYPES.find((st) => st.value === suggestion.suggestion_type);
          return (
            <div
              key={suggestion.id}
              className={cn(
                'bg-app-card rounded-xl border p-4 transition-colors',
                selectedIds.has(suggestion.id)
                  ? 'border-accent bg-accent-muted'
                  : 'border-app-border',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelect(suggestion.id)}
                    className="text-app-text-muted hover:text-app-text-secondary transition-colors"
                  >
                    {selectedIds.has(suggestion.id) ? (
                      <CheckSquare className="w-4 h-4 text-lime-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                      typeConfig?.color || 'bg-app-bg text-app-text-secondary',
                    )}
                  >
                    {typeConfig?.emoji} {typeConfig?.label}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(suggestion.id)}
                  className="p-1 text-app-text-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-sm font-semibold text-app-text">
                  {suggestion.menu_item?.name || tc('unknown')}
                </p>
                <p className="text-xs text-app-text-muted">{tc('suggests')}</p>
                <p className="text-sm font-semibold text-primary">
                  {suggestion.suggested_item?.name || tc('unknown')}
                </p>
              </div>

              {suggestion.description && (
                <p className="mt-2 text-xs text-app-text-secondary italic">
                  &ldquo;{suggestion.description}&rdquo;
                </p>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-app-text-muted">
            <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t('noSuggestions')}</p>
            <p className="text-xs mt-1">{t('addServerAdvice')}</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AdminModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('newSuggestion')}
        size="lg"
      >
        <div className="space-y-4 pt-4">
          <div>
            <Label className="text-sm font-medium text-app-text mb-1.5 block">
              {t('sourceDish')}
            </Label>
            <select
              value={sourceItemId}
              onChange={(e) => setSourceItemId(e.target.value)}
              className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
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
            <Label className="text-sm font-medium text-app-text mb-1.5 block">
              {t('suggestionType')}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {SUGGESTION_TYPES.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setSuggestionType(st.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all',
                    suggestionType === st.value
                      ? 'border-accent bg-accent-muted text-app-text'
                      : 'border-app-border text-app-text-secondary hover:bg-app-bg',
                  )}
                >
                  <span>{st.emoji}</span>
                  <span>{st.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-app-text mb-1.5 block">
              {t('suggestedDish')}
            </Label>
            <select
              value={targetItemId}
              onChange={(e) => setTargetItemId(e.target.value)}
              className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
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
            <Label className="text-sm font-medium text-app-text mb-1.5 block">
              {t('serverAdvice')}
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('serverAdvicePlaceholder')}
              className="rounded-lg focus-visible:ring-accent"
            />
            <p className="mt-1 text-xs text-app-text-secondary">{t('addServerAdvice')}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setShowAdd(false)}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleAdd} variant="default">
            {tc('add')}
          </Button>
        </div>
      </AdminModal>
    </div>
  );
}
