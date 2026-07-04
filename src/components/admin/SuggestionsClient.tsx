'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import type { SuggestionType } from '@/types/inventory.types';
import { createSuggestionService } from '@/services/suggestion.service';
import {
  actionCreateSuggestion,
  actionDeactivateSuggestion,
  actionBulkDeactivateSuggestions,
  actionGenerateAndSaveSuggestions,
} from '@/app/actions/suggestions';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import type { MenuItem, Suggestion, SuggestionTypeConfig } from './suggestions/types';
import SuggestionsToolbar from './suggestions/SuggestionsToolbar';
import SuggestionsList from './suggestions/SuggestionsList';
import SuggestionAddModal from './suggestions/SuggestionAddModal';

interface SuggestionsClientProps {
  tenantId: string;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionStatus?: SubscriptionStatus | null;
  trialEndsAt?: string | null;
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
    'canAccessAIAnalytics',
    subscriptionPlan,
    subscriptionStatus,
    trialEndsAt,
  );

  const SUGGESTION_TYPES: SuggestionTypeConfig[] = [
    {
      value: 'pairing',
      label: t('pairing'),
      emoji: '\uD83C\uDF77',
      color: 'border border-[var(--border)] text-[var(--muted-foreground)]',
    },
    {
      value: 'upsell',
      label: t('upsell'),
      emoji: '\uD83D\uDCA1',
      color: 'border border-[var(--border)] text-[var(--warning)]',
    },
    {
      value: 'alternative',
      label: t('alternativeItem'),
      emoji: '\uD83D\uDD04',
      color: 'border border-[var(--border)] text-[var(--muted-foreground)]',
    },
  ];

  const loadData = useCallback(async () => {
    try {
      const service = createSuggestionService(supabase);
      const [items, activeSuggestions] = await Promise.all([
        service.listAvailableItems(tenantId),
        service.listActiveSuggestions(tenantId),
      ]);
      setMenuItems(items as MenuItem[]);
      setSuggestions(activeSuggestions as Suggestion[]);
    } catch {
      toast({ title: tc('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reload only when tenantId changes; supabase/toast/tc are stable singletons and including them would re-run the fetch on unrelated identity changes (2026-06-18)
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

    const result = await actionCreateSuggestion(tenantId, {
      tenant_id: tenantId,
      menu_item_id: sourceItemId,
      suggested_item_id: targetItemId,
      suggestion_type: suggestionType,
      description: description.trim() || null,
      display_order: suggestions.length,
    });
    if (result.error) {
      toast({ title: tc('error'), variant: 'destructive' });
      return;
    }
    toast({ title: t('suggestionAdded') });
    setShowAdd(false);
    setSourceItemId('');
    setTargetItemId('');
    setDescription('');
    loadData();
  };

  const handleDelete = async (id: string) => {
    const result = await actionDeactivateSuggestion(tenantId, id);
    if (result.error) {
      toast({ title: tc('error'), variant: 'destructive' });
      return;
    }
    toast({ title: t('suggestionDeleted') });
    loadData();
  };

  const handleAutoGenerate = async () => {
    setGenerating(true);
    const result = await actionGenerateAndSaveSuggestions(tenantId);
    setGenerating(false);
    if (result.error) {
      toast({ title: tc('error'), variant: 'destructive' });
      return;
    }
    toast({ title: t('suggestionsGenerated', { count: result.data ?? 0 }) });
    loadData();
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
    const result = await actionBulkDeactivateSuggestions(tenantId, Array.from(selectedIds));
    if (result.error) {
      toast({ title: tc('error'), variant: 'destructive' });
      return;
    }
    toast({ title: t('suggestionsDeleted', { count: selectedIds.size }) });
    setSelectedIds(new Set());
    loadData();
  };

  const filtered = suggestions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.menu_item?.name.toLowerCase().includes(q) ||
      s.suggested_item?.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-app-text-secondary">
          {tc('loading')}
        </div>
      ) : (
        <>
          {/* Header + Search + Bulk actions */}
          <SuggestionsToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            canAutoGenerate={canAutoGenerate}
            onAutoGenerate={handleAutoGenerate}
            generating={generating}
            menuItemsCount={menuItems.length}
            onAdd={() => setShowAdd(true)}
            hasSuggestions={suggestions.length > 0}
            selectedCount={selectedIds.size}
            filteredCount={filtered.length}
            onToggleSelectAll={toggleSelectAll}
            onBulkDelete={handleBulkDelete}
          />

          {/* Suggestions List */}
          <SuggestionsList
            items={filtered}
            suggestionTypes={SUGGESTION_TYPES}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onDelete={handleDelete}
          />

          {/* Add Modal */}
          <SuggestionAddModal
            isOpen={showAdd}
            onClose={() => setShowAdd(false)}
            menuItems={menuItems}
            suggestionTypes={SUGGESTION_TYPES}
            sourceItemId={sourceItemId}
            onSourceChange={setSourceItemId}
            targetItemId={targetItemId}
            onTargetChange={setTargetItemId}
            suggestionType={suggestionType}
            onTypeChange={setSuggestionType}
            description={description}
            onDescriptionChange={setDescription}
            onSubmit={handleAdd}
          />
        </>
      )}
    </div>
  );
}
