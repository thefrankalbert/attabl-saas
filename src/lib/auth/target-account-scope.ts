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

// Local: aucun consommateur hors de ce module (reserve S4 du contre-audit
// LOT 6, signalee par `pnpm knip` comme export inutilise).
type TargetAccountScopeDenial = 'cross_tenant' | 'platform_account' | 'lookup_failed';

export type TargetAccountScopeResult =
  { allowed: true } | { allowed: false; reason: TargetAccountScopeDenial };

interface MembershipRow {
  tenant_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  /**
   * Retire par la plateforme (console super-admin, `actionSoftDeleteAdminUser`).
   *
   * PORTEE EXACTE DE CET INVARIANT, a ne pas elargir (refutation R2 du
   * contre-audit LOT 6, qui a montre que la version precedente de ce
   * commentaire etait fausse). Une ligne soft-deleted n'ouvre plus aucun acces
   * APPLICATIF: les trois resolutions de session filtrent `deleted_at is null`
   * (src/lib/auth/get-session.ts:132, 166, 216), comme les gardes de route.
   * En BASE, ce n'est pas vrai: les policies passent par
   * `get_my_tenant_ids_array()`, et aucune ne regarde `deleted_at` - sauf la
   * policy RESTRICTIVE de la migration 20261105000000, qui ne couvre que
   * l'UPDATE de `admin_users` par un role client. Si une ligne retiree
   * n'ouvre effectivement rien cote base, c'est uniquement parce que
   * `softDeleteAdminUser` pose AUSSI `is_active = false`
   * (src/services/platform-admin.service.ts). L'invariant repose donc sur
   * `is_active`, pas sur `deleted_at`.
   *
   * HYPOTHESE, a traiter comme telle (reserve B-5 du contre-audit
   * FINAL-LOTS-8-9): que `get_my_tenant_ids_array()` filtre
   * `coalesce(is_active, true) = true` vient de
   * supabase/migrations/20260731000600_tenant_helpers_active_only.sql, dont
   * l'application en production n'est PAS etablie - le dump
   * supabase/schema.sql, qui est anterieur, declare encore cette fonction sans
   * aucun filtre, et la memoire du projet dit les migrations RLS non prouvees
   * appliquees. Si cette migration n'est pas en place, une ligne retiree reste
   * comptee par les policies: c'est exactement pour cela que le relachement
   * ci-dessous reste cantonne a l'envoi d'un lien.
   */
  deleted_at: string | null;
}

export interface TargetAccountScopeOptions {
  /**
   * Ne compter, pour le verdict `cross_tenant`, que les appartenances NON
   * retirees par la plateforme.
   *
   * OPT-IN, et volontairement reserve a `actionResetUserPassword` (refutation R2
   * du contre-audit LOT 6: pose en defaut dans ce garde partage, le relachement
   * descendait aussi sur `actionUpdateUserEmail`, qui ecrit l'identite du compte
   * auth - la primitive de prise de controle, pas un envoi de courriel).
   *
   * Ce que ce relachement achete: une ligne `admin_users` parasite redevient
   * recuperable SANS l'attaquant (la plateforme la retire depuis sa console, le
   * gel du proprietaire legitime cesse). Ce qu'il coute, et pourquoi il reste
   * cantonne a l'envoi d'un lien: l'invariant ci-dessus tient sur `is_active`,
   * donc sur une colonne que `authenticated` a longtemps pu ecrire lui-meme
   * (`GRANT UPDATE("is_active")`). La migration 20261105000000 le lui retire
   * (`revoke update (is_active) ... from authenticated`, section 4), ce qui
   * renforce l'invariant - mais cette migration n'est pas encore appliquee, et
   * un re-grant futur rouvrirait la meme porte. Le pire effet de l'action
   * relachee doit donc rester un courriel envoye sur la boite du TITULAIRE.
   */
  ignoreSoftDeletedMemberships?: boolean;
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
 * Les lignes SOFT-DELETED par la plateforme comptent PAR DEFAUT. Un appelant
 * peut demander de les ignorer pour le seul verdict `cross_tenant`, via
 * `ignoreSoftDeletedMemberships` (correctif R2' point 2 du contre-audit LOT 4,
 * recadre par la refutation R2 du contre-audit LOT 6: voir la documentation de
 * cette option, qui dit ce que le relachement achete et ce qu'il coute).
 *
 * Le verdict `platform_account`, lui, porte TOUJOURS sur toutes les lignes,
 * soft-deleted comprises, quelle que soit l'option: un compte d'operateur de la
 * plateforme ne doit jamais devenir accessible a un admin de tenant parce que
 * son appartenance a ete retiree.
 *
 * Toute erreur de lecture refuse (fail-closed), ainsi qu'une cible qui n'a plus
 * aucune appartenance a compter.
 */
export async function checkTargetAccountScope(
  client: SupabaseClient,
  targetUserId: string,
  tenantId: string,
  options: TargetAccountScopeOptions = {},
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

  // Appartenances retenues pour le verdict `cross_tenant`. Par defaut: toutes.
  const scopedRows = options.ignoreSoftDeletedMemberships
    ? rows.filter((row) => row.deleted_at == null)
    : rows;

  if (scopedRows.length === 0) {
    logger.warn('checkTargetAccountScope: aucune appartenance a compter sur le compte cible', {
      tenantId,
      rowCount: rows.length,
    });
    return { allowed: false, reason: 'lookup_failed' };
  }

  if (scopedRows.some((row) => row.tenant_id !== tenantId)) {
    return { allowed: false, reason: 'cross_tenant' };
  }

  return { allowed: true };
}
