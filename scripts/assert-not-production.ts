/**
 * Garde-fou anti-production pour les scripts qui ECRIVENT en base (LOT 7.1 #10).
 *
 * `seed-demo.ts` et `seed-qa.ts` chargent `.env.local`. Or `.env.local` pointe sur
 * la base de PRODUCTION sur ce poste. Lances tels quels, ils ecrasaient le tenant
 * de demonstration REEL: suppression puis recreation de ses menus, categories,
 * commandes et comptes. Aucun garde-fou n'existait de leur cote, alors que le
 * harnais de parcours en avait deja un (`tests/journeys/fixtures/env.ts`).
 *
 * Le meme incident s'est deja produit sur ce projet: une session de QA lancee avec
 * les identifiants de production a pollue le tableau de bord d'un client.
 *
 * Fail-closed: en cas de doute (URL absente), on refuse.
 */

/**
 * Ref du projet Supabase de PRODUCTION Attabl.
 *
 * Source unique: `tests/journeys/fixtures/env.ts` importe cette liste. Deux copies
 * finiraient par diverger, et la copie oubliee est precisement celle qui laisse
 * passer une ecriture en production.
 */
export const PROD_SUPABASE_REFS = ['nqufpobuozrzwpeijkxt'];

/** Hotes de PRODUCTION de l'application. */
export const PROD_APP_HOSTS = ['attabl.com', 'attabl-saas.vercel.app'];

/**
 * Stoppe le script si l'URL Supabase fournie designe la production.
 *
 * @param supabaseUrl URL effectivement utilisee par le script.
 * @param scriptName nom affiche dans le message d'erreur.
 */
export function assertNotProduction(supabaseUrl: string | undefined, scriptName: string): void {
  if (!supabaseUrl) {
    throw new Error(
      `SECURITE: ${scriptName} n'a pas d'URL Supabase. Refus par principe: ` +
        `sans cible identifiable, impossible de garantir que ce n'est pas la production.`,
    );
  }

  const isProduction = PROD_SUPABASE_REFS.some((ref) => supabaseUrl.includes(ref));
  if (!isProduction) return;

  throw new Error(
    `SECURITE: ${scriptName} pointe sur la base de PRODUCTION (${supabaseUrl}).\n` +
      `Ce script EFFACE et recree des donnees. Sur la production, il detruirait les\n` +
      `donnees reelles du tenant de demonstration.\n` +
      `Utilise une base locale (supabase start) ou un projet de staging.`,
  );
}
