-- ============================================================================
-- Audit B8 (Moyenne), etape 2 sur 2: retrait de l'ancienne unicite
-- (user_id, endpoint), qui empechait un appareil d'etre abonne a deux
-- restaurants. L'etape 1 (20261124160000) a pose UNIQUE (tenant_id, user_id,
-- endpoint), qui reste la seule.
--
-- ORDRE DE DEPLOIEMENT: APRES le code en ligne (et apres 20261124160000).
--   - Ancien code + cette base: l'ancien upsert vise (user_id, endpoint), qui
--     n'a plus de contrainte: Postgres refuse (42P10) et TOUT abonnement
--     echoue. D'ou "apres le code".
--   - Nouveau code + base sans cette etape: voir l'en-tete de 20261124160000
--     (second restaurant refuse en 23505, rien de deplace).
--
-- ROLLBACK: ne se rejoue que si aucun appareil n'est abonne a deux
-- restaurants; sinon supprimer d'abord les doublons (garder la ligne la plus
-- recente par user_id, endpoint), puis:
--   ALTER TABLE public.push_subscriptions
--     ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);
--
-- Nom reel en production (lu le 2026-11-24): `push_subscriptions_user_id_endpoint_key`,
-- UNIQUE (user_id, endpoint), et son index du meme nom.
--
-- CONTROLE FINAL (contre-audit 1): un `DROP ... IF EXISTS` par nom ne fait rien,
-- sans erreur, si la contrainte porte un autre nom. Le bloc DO de fin leve une
-- erreur (et annule la migration) s'il reste une contrainte UNIQUE ou un index
-- unique portant EXACTEMENT les colonnes (user_id, endpoint).
--
-- Rejouable (IF EXISTS, controle en lecture).
-- ============================================================================

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

DO $$
DECLARE
  v_restant text;
BEGIN
  SELECT string_agg(i.relname, ', ')
    INTO v_restant
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
   WHERE x.indrelid = 'public.push_subscriptions'::regclass
     AND x.indisunique
     AND (
       SELECT array_agg(a.attname::text ORDER BY a.attname)
         FROM unnest(x.indkey::int2[]) AS k(attnum)
         JOIN pg_attribute a
           ON a.attrelid = x.indrelid AND a.attnum = k.attnum
     ) = ARRAY['endpoint', 'user_id']
     AND x.indnkeyatts = 2;
  IF v_restant IS NOT NULL THEN
    RAISE EXCEPTION 'B8: unicite (user_id, endpoint) toujours presente sur push_subscriptions: %', v_restant;
  END IF;
END
$$;
