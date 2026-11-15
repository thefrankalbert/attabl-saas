// Lectures de faits pour les rappels a heure fixe (stock avant service, bilan
// de la semaine). Toujours filtrees par restaurant.

import type { SupabaseClient } from '@supabase/supabase-js';
import { coachFacts, type CoachFacts } from './rules';
import type { StockFacts } from './messages';

const DAY_MS = 24 * 60 * 60_000;

export async function loadStockFacts(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<StockFacts> {
  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock_alert')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if (error) throw error;
  const rows = ingredients ?? [];
  const out = rows.filter((i) => Number(i.current_stock) <= 0);
  const low = rows.filter(
    (i) =>
      Number(i.current_stock) > 0 &&
      Number(i.min_stock_alert) > 0 &&
      Number(i.current_stock) <= Number(i.min_stock_alert),
  );

  let hiddenDishes: string[] = [];
  if (out.length) {
    const { data: recipes, error: rErr } = await supabase
      .from('recipes')
      .select('menu_item:menu_items(name, is_available)')
      .eq('tenant_id', tenantId)
      .in(
        'ingredient_id',
        out.map((i) => i.id as string),
      );
    if (rErr) throw rErr;
    hiddenDishes = [
      ...new Set(
        (recipes ?? [])
          .map((r) => r.menu_item as unknown as { name: string; is_available: boolean } | null)
          .filter((m): m is { name: string; is_available: boolean } => !!m && !m.is_available)
          .map((m) => m.name),
      ),
    ];
  }
  return {
    outOfStock: out.map((i) => i.name as string),
    low: low.map((i) => i.name as string),
    hiddenDishes,
  };
}

/**
 * Faits du bilan, agreges EN BASE (reminder_coach_slots / reminder_coach_items):
 * l'API plafonne chaque reponse a 1000 lignes, lire les commandes brutes
 * tronquait les faits d'un restaurant actif.
 */
export async function loadCoachFacts(
  supabase: SupabaseClient,
  tenantId: string,
  timeZone: string,
  now: Date,
): Promise<CoachFacts | null> {
  const since = new Date(now.getTime() - 28 * DAY_MS).toISOString();
  const split = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const until = now.toISOString();
  const [firstRes, slotsRes, itemsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.rpc('reminder_coach_slots', {
      p_tenant_id: tenantId,
      p_since: since,
      p_until: until,
      p_tz: timeZone,
    }),
    supabase.rpc('reminder_coach_items', {
      p_tenant_id: tenantId,
      p_since: since,
      p_split: split,
      p_until: until,
    }),
  ]);
  if (firstRes.error) throw firstRes.error;
  if (slotsRes.error) throw slotsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  return coachFacts(
    {
      slots: ((slotsRes.data ?? []) as { dow: number; hour: number; orders: number }[]).map(
        (r) => ({ dow: Number(r.dow), hour: Number(r.hour), orders: Number(r.orders) }),
      ),
      items: (
        (itemsRes.data ?? []) as { name: string; before_qty: number; last_week_qty: number }[]
      ).map((r) => ({
        name: r.name,
        before_qty: Number(r.before_qty),
        last_week_qty: Number(r.last_week_qty),
      })),
      firstOrderAt: (firstRes.data?.created_at as string | undefined) ?? null,
    },
    now,
  );
}
