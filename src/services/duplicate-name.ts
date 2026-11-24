import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

interface DuplicateCheck {
  table: 'menus' | 'categories' | 'menu_items';
  tenantId: string;
  name: string;
  /** Message affiche si le nom existe deja. */
  message: string;
  /** Limite la comparaison a un parent (ex: meme categorie pour un plat). */
  scope?: { column: string; value: string | null | undefined };
  /** Ignore les lignes supprimees (menu_items est en suppression douce). */
  excludeSoftDeleted?: boolean;
  /** Renommage: la ligne modifiee ne compte pas comme doublon d'elle-meme. */
  excludeId?: string;
}

/** Echappe % _ \ pour que ilike compare le texte tel quel (insensible a la casse). */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Refuse un doublon de nom (insensible a la casse, espaces de bord ignores) pour un tenant.
 * Echec de la lecture: on laisse passer (la creation reste possible) mais on le journalise.
 */
export async function assertNameAvailable(
  supabase: SupabaseClient,
  check: DuplicateCheck,
): Promise<void> {
  const name = check.name.trim();
  if (!name) return;

  let query = supabase
    .from(check.table)
    .select('id')
    .eq('tenant_id', check.tenantId)
    .ilike('name', escapeIlike(name));

  // Parent nul (categorie sans carte, plat sans categorie): on compare aux
  // seules lignes sans parent, pas a tout le restaurant (audit B37).
  if (check.scope) {
    query = check.scope.value
      ? query.eq(check.scope.column, check.scope.value)
      : query.is(check.scope.column, null);
  }
  if (check.excludeSoftDeleted) query = query.is('deleted_at', null);
  if (check.excludeId) query = query.neq('id', check.excludeId);

  const { data, error } = await query.limit(1);
  if (error) {
    logger.warn('Duplicate name check failed', { table: check.table, error: error.message });
    return;
  }
  if (data && data.length > 0) throw new ServiceError(check.message, 'VALIDATION');
}
