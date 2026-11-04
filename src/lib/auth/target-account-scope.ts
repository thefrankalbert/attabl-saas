import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * SECURITE (constats ACT-14 / SVC-12, prise de controle de compte).
 *
 * Certaines actions admin agissent non pas sur la ligne admin_users (scopee au
 * tenant) mais sur le COMPTE AUTH GLOBAL du membre vise: reinitialisation de
 * mot de passe, changement d'email. Verifier seulement que la ligne cible
 * appartient au tenant de l'appelant ne suffit donc pas: si le meme compte auth
 * est aussi membre d'un AUTRE tenant, ou s'il s'agit d'un compte plateforme
 * (super_admin), l'action deborde du perimetre de l'appelant et lui donne le
 * controle du compte d'un tiers.
 *
 * Ce garde repond a une seule question: le compte auth vise est-il entierement
 * contenu dans ce tenant ?
 */

export type TargetAccountScopeDenial = 'cross_tenant' | 'platform_account' | 'lookup_failed';

export type TargetAccountScopeResult =
  | { allowed: true }
  | { allowed: false; reason: TargetAccountScopeDenial };

interface MembershipRow {
  tenant_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  /**
   * Retire par la plateforme (console super-admin, `actionSoftDeleteAdminUser`).
   * Une ligne soft-deleted n'ouvre plus aucun acces: toutes les resolutions de
   * session filtrent `deleted_at is null` (src/lib/auth/get-session.ts).
   */
  deleted_at: string | null;
}

/**
 * Verifie que TOUTES les appartenances du compte auth cible vivent dans
 * `tenantId` et qu'aucune n'est un compte plateforme.
 *
 * Note multi-tenant: cette requete est volontairement NON filtree par
 * tenant_id - c'est precisement l'existence de lignes hors du tenant courant
 * qu'elle cherche a detecter. Elle ne renvoie aucune donnee d'un autre tenant a
 * l'appelant, seulement un verdict booleen. Elle doit tourner avec un client
 * qui voit toutes les lignes (client admin), sinon le RLS masquerait les
 * appartenances etrangeres et le garde repondrait toujours "autorise".
 *
 * Les lignes INACTIVES comptent: `is_active = false` est un etat de tenant, le
 * compte auth reste partage.
 *
 * Les lignes SOFT-DELETED par la plateforme ne comptent PAS pour le verdict
 * `cross_tenant` (correctif R2' point 2 du contre-audit LOT 4). C'est ce qui
 * rend une ligne `admin_users` parasite recuperable SANS l'attaquant: le
 * proprietaire legitime la signale, la plateforme la retire depuis sa console
 * (`actionSoftDeleteAdminUser`, super-admin, audite), et le gel du compte de
 * l'employe cesse. Tant qu'elles comptaient, le retrait cote plateforme
 * n'avait aucun effet sur ce garde et le gel etait definitif - c'est le defaut
 * precis que la refutation R2' pointe ("un journal n'est pas une suppression").
 * Une ligne soft-deleted ne confere aucun acces, donc l'ignorer ici ne rouvre
 * rien.
 *
 * Le verdict `platform_account`, lui, continue de porter sur TOUTES les lignes,
 * soft-deleted comprises: un compte d'operateur de la plateforme ne doit jamais
 * devenir accessible a un admin de tenant parce que son appartenance a ete
 * retiree.
 *
 * Toute erreur de lecture refuse (fail-closed), ainsi qu'une cible qui n'a plus
 * aucune appartenance vivante.
 */
export async function checkTargetAccountScope(
  client: SupabaseClient,
  targetUserId: string,
  tenantId: string,
): Promise<TargetAccountScopeResult> {
  const { data, error } = await client
    .from('admin_users')
    .select('tenant_id, role, is_super_admin, deleted_at')
    .eq('user_id', targetUserId);

  const rows = (data ?? []) as MembershipRow[];

  if (error || rows.length === 0) {
    logger.warn('checkTargetAccountScope: lecture des appartenances impossible', {
      tenantId,
      error: error?.message,
      rowCount: rows.length,
    });
    return { allowed: false, reason: 'lookup_failed' };
  }

  if (rows.some((row) => row.is_super_admin === true || row.role === 'super_admin')) {
    return { allowed: false, reason: 'platform_account' };
  }

  // Appartenances qui ouvrent encore un acces (voir la note sur le soft-delete).
  const liveRows = rows.filter((row) => row.deleted_at == null);

  if (liveRows.length === 0) {
    logger.warn('checkTargetAccountScope: aucune appartenance vivante sur le compte cible', {
      tenantId,
      rowCount: rows.length,
    });
    return { allowed: false, reason: 'lookup_failed' };
  }

  if (liveRows.some((row) => row.tenant_id !== tenantId)) {
    return { allowed: false, reason: 'cross_tenant' };
  }

  return { allowed: true };
}
