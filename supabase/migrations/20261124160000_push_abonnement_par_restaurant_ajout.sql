-- ============================================================================
-- Audit B8 (Moyenne), etape 1 sur 2: un meme telephone peut recevoir les
-- alertes de PLUSIEURS restaurants.
--
-- CE QUI NE TENAIT PAS. `push_subscriptions` porte UNIQUE (user_id, endpoint)
-- (`push_subscriptions_user_id_endpoint_key`, 20260226000003, identique dans
-- l'instantane `supabase/schema.sql`). Un proprietaire de deux restaurants A et
-- B sur le meme appareil n'a donc qu'UNE ligne: s'abonner depuis B reecrit
-- `tenant_id` de A vers B (upsert sur user_id,endpoint), et A cesse d'envoyer,
-- sans aucun message.
--
-- LA CORRECTION. L'unicite porte sur (tenant_id, user_id, endpoint): une ligne
-- par restaurant pour le meme appareil. Cette etape AJOUTE la nouvelle
-- contrainte sans retirer l'ancienne (20261124160100 la retire, APRES le code).
-- Les lignes existantes sont deja uniques sur (user_id, endpoint), donc a
-- fortiori sur le triplet: aucune donnee a reprendre, un telephone deja abonne
-- garde sa ligne et son restaurant.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code.
--   - Ancien code + cette base: l'ancien upsert vise (user_id, endpoint),
--     contrainte toujours presente: comportement identique a aujourd'hui.
--   - Nouveau code + base SANS cette etape: l'upsert vise
--     (tenant_id, user_id, endpoint), qu'aucune contrainte ne porte: Postgres
--     refuse (42P10) et TOUT abonnement echoue. D'ou "avant le code".
--   - Nouveau code + cette etape seule (avant 160100): s'abonner depuis un
--     second restaurant heurte encore l'ancienne contrainte (23505, 500 a
--     l'ecran, aucune ligne deplacee); le premier restaurant reste servi.
--
-- ROLLBACK: ALTER TABLE public.push_subscriptions
--   DROP CONSTRAINT IF EXISTS push_subscriptions_tenant_user_endpoint_key;
--
-- Rejouable: la contrainte n'est ajoutee que si elle manque.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND conname = 'push_subscriptions_tenant_user_endpoint_key'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_tenant_user_endpoint_key
      UNIQUE (tenant_id, user_id, endpoint);
  END IF;
END
$$;
