-- ============================================================================
-- Audit B111 (Basse): une session de connexion ne peut plus etre inseree au
-- nom d'un autre restaurant.
--
-- CE QUI NE TENAIT PAS. La politique "Users can insert own sessions"
-- (production, lue le 2026-11-23) verifie que `user_id` est une des lignes
-- `admin_users` du compte, mais pas `tenant_id`: un membre du restaurant A
-- inserait une session portant le `tenant_id` du restaurant B.
--
-- LA CORRECTION. Le couple (`user_id`, `tenant_id`) doit designer UNE MEME
-- ligne `admin_users` VIVANTE (active, non supprimee) du compte connecte: un
-- membre desactive ne journalise plus de connexion dans ce restaurant. `user_sessions.user_id` reference
-- `admin_users.id` (cle etrangere `user_sessions_user_id_fkey`).
-- La sous-requete lit `admin_users` sous la RLS de l'appelant, qui lui laisse
-- toujours lire ses propres lignes (`user_id = auth.uid()`), comme la politique
-- d'origine.
--
-- PARCOURS VERIFIE: la seule ecriture applicative est la connexion OAuth
-- (`src/app/auth/callback/route.ts`), qui insere `user_id = existingAdmin.id`
-- et `tenant_id = existingAdmin.tenant_id`, pris sur la meme ligne.
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne.
--
-- ROLLBACK: rejouer la politique de `20260217000000_permissions_system.sql`.
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;

CREATE POLICY "Users can insert own sessions"
  ON public.user_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.admin_users au
       WHERE au.id = user_sessions.user_id
         AND au.tenant_id = user_sessions.tenant_id
         AND au.user_id = (SELECT auth.uid())
         AND coalesce(au.is_active, true)
         AND au.deleted_at IS NULL
    )
  );
