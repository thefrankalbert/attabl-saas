// Operations SQL du script scripts/manage-super-admin.js.
//
// Separees du script pour etre testees sans base (client simule) ET sur un
// banc (vraie base) : scripts/__tests__/manage-super-admin.test.sh.
//
// Quatre regles, chacune nee d'un defaut reel de l'ancien script :
//
//  1. UNE ligne, jamais "toutes les lignes de cet email". Un email peut exister
//     dans plusieurs restaurants : chaque requete cible (email, restaurant) et
//     verifie qu'elle a touche exactement une ligne, sinon tout est annule.
//  2. Le declencheur `prevent_super_admin_elevation` refuse tout changement de
//     `is_super_admin` hors role de service. Chaque operation tourne donc dans
//     UNE transaction qui commence par poser `request.jwt.claim.role` pour
//     cette transaction seulement (3e argument `true`). Le declencheur n'est
//     jamais desactive.
//  3. `role` n'est plus jamais reecrit. L'ancienne revocation ecrivait
//     `role = 'admin'` (un administrateur complet du restaurant), l'ancienne
//     activation ecrivait `role = 'super_admin'` sur n'importe quelle ligne,
//     proprietaire compris.
//  4. Le proprietaire d'un restaurant n'est jamais desactive ni supprime ici.

const CIBLE = `email = $1 AND tenant_id = (SELECT id FROM tenants WHERE slug = $2)`;

/** Une operation = une transaction, avec le reglage de session local. */
async function transaction(pg, travail) {
  await pg.query('BEGIN');
  try {
    await pg.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)");
    const resultat = await travail();
    await pg.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await pg.query('ROLLBACK');
    throw erreur;
  }
}

function exigerUneLigne(res) {
  if (res.rowCount !== 1) {
    throw new Error(`lignes touchees : ${res.rowCount}, attendu 1 (rien n'a ete modifie)`);
  }
}

async function lireLigne(pg, email, slug) {
  const res = await pg.query(
    `SELECT au.id, au.user_id, au.email, au.role, au.postes, au.is_super_admin,
            au.is_active, au.deleted_at, t.slug AS tenant_slug
       FROM admin_users au JOIN tenants t ON t.id = au.tenant_id
      WHERE au.email = $1 AND t.slug = $2`,
    [email, slug],
  );
  if (res.rows.length !== 1) {
    throw new Error(
      `${res.rows.length} ligne(s) pour ${email} dans le restaurant "${slug}", attendu 1`,
    );
  }
  return res.rows[0];
}

/** Ligne de plateforme pure : aucun poste de restaurant. */
const estLignePlateforme = (ligne) => ligne.role === 'super_admin';

/**
 * Revocation. Ligne de plateforme : le drapeau tombe et la ligne est
 * desactivee. Membre ordinaire qui portait le drapeau (un proprietaire, par
 * exemple) : seul le drapeau tombe, il reste membre actif. `deleted_at` n'est
 * pas touche, la reactivation reste un simple retour.
 */
async function revoquer(pg, email, slug) {
  return transaction(pg, async () => {
    const ligne = await lireLigne(pg, email, slug);
    const res = await pg.query(
      estLignePlateforme(ligne)
        ? `UPDATE admin_users SET is_super_admin = false, is_active = false WHERE ${CIBLE}`
        : `UPDATE admin_users SET is_super_admin = false WHERE ${CIBLE}`,
      [email, slug],
    );
    exigerUneLigne(res);
    return { lignePlateforme: estLignePlateforme(ligne) };
  });
}

/**
 * Activation. Le drapeau est pose ; une ligne de plateforme est en plus
 * reactivee (revoquer puis reactiver rend bien la console plateforme).
 */
async function activer(pg, email, slug) {
  return transaction(pg, async () => {
    const ligne = await lireLigne(pg, email, slug);
    const res = await pg.query(
      estLignePlateforme(ligne)
        ? `UPDATE admin_users SET is_super_admin = true, is_active = true, deleted_at = NULL WHERE ${CIBLE}`
        : `UPDATE admin_users SET is_super_admin = true WHERE ${CIBLE}`,
      [email, slug],
    );
    exigerUneLigne(res);
    return { lignePlateforme: estLignePlateforme(ligne) };
  });
}

/**
 * Suppression de LA ligne ciblee. Refusee pour un proprietaire (supprimer ou
 * transferer le restaurant d'abord). Rend `user_id` et le nombre de lignes
 * `admin_users` qui restent a ce compte : l'appelant ne supprime le compte
 * d'authentification que s'il n'en reste aucune.
 */
async function supprimer(pg, email, slug) {
  return transaction(pg, async () => {
    const ligne = await lireLigne(pg, email, slug);
    if ((ligne.postes || []).includes('owner')) {
      throw new Error(
        `${email} est proprietaire du restaurant "${slug}" : supprimez ou transferez le restaurant d'abord`,
      );
    }
    exigerUneLigne(await pg.query(`DELETE FROM admin_users WHERE ${CIBLE}`, [email, slug]));
    const reste = await pg.query('SELECT count(*)::int AS n FROM admin_users WHERE user_id = $1', [
      ligne.user_id,
    ]);
    return { userId: ligne.user_id, lignesRestantes: reste.rows[0].n };
  });
}

module.exports = { lireLigne, revoquer, activer, supprimer };
