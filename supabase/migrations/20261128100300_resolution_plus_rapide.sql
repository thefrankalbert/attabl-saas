-- Lot 1 des roles du personnel : resolution des droits plus rapide a l'ecriture.
--
-- POURQUOI. Mesure de la phase A (docs/roles-personnel/ecarts-phase-a.md, C1) :
-- la garde d'ecriture coutait environ 7 fois plus par appel qu'avant le lot
-- (UPDATE de 500 plats par un gerant : 153 ms avant, 1190 ms apres). Elle est
-- appelee deux fois par ligne (USING et WITH CHECK). Cause : deux fonctions en
-- LANGUAGE sql que PostgreSQL 17 replanifie a CHAQUE appel,
-- `tenant_permission_level` et `private.matrice_postes()` (86 lignes de VALUES).
--
-- CE QUE FAIT CE FICHIER. Les deux fonctions passent en plpgsql, dont le plan
-- est garde en memoire par session. RIEN d'autre ne change : meme requete, mot
-- pour mot, meme signature, meme type de retour, memes attributs (STABLE,
-- SECURITY DEFINER, IMMUTABLE), meme `SET search_path = ''`, memes privileges
-- (CREATE OR REPLACE les conserve). Mesure sur le banc, memes donnees :
-- environ 1200 a 1600 ms avant ce fichier, 210 a 240 ms apres.
--
-- VARIANTE ECARTEE. Retirer `SET search_path` a `matrice_postes()` gagnait
-- encore un peu (190 a 210 ms) mais faisait tomber le controle "chaque fonction
-- fixe son search_path" (privileges_fonctions_droits.test.sql, assertion 64).
-- Decision et mesures : docs/roles-personnel/ecarts-phase-b.md.
--
-- PARITE. Les 86 triplets de la matrice sont recopies a l'identique depuis
-- 20261128100000 (copie programmee). Le test Vitest
-- src/lib/__tests__/permission-defaults-sql.test.ts lit desormais CE fichier
-- (la derniere definition) et exige l'egalite avec POSTE_MATRIX.
--
-- RETOUR ARRIERE : supabase/retour-arriere/20261128100300_retour_resolution_plus_rapide.sql
-- (remet les deux corps en LANGUAGE sql). Les retours de MIG2 et de MIG1
-- suppriment de toute facon ces deux fonctions : l'ordre complet reste
-- MIG3, MIG2, MIG1.

BEGIN;

CREATE OR REPLACE FUNCTION private.matrice_postes()
RETURNS TABLE (poste text, droit text, niveau text)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
BEGIN
  RETURN QUERY
  VALUES
    ('manager','menu.view','full'), ('manager','menu.edit','full'), ('manager','menu.price','full'),
    ('manager','orders.take','full'), ('manager','kitchen.track','full'), ('manager','orders.cancel','full'),
    ('manager','orders.discount','full'), ('manager','orders.refund','full'), ('manager','orders.pay','full'),
    ('manager','cash.close','full'), ('manager','cash.count','full'), ('manager','reports.menu','full'),
    ('manager','reports.money','full'), ('manager','reports.own','full'), ('manager','inventory.view','full'),
    ('manager','inventory.edit','full'), ('manager','suppliers.manage','full'), ('manager','team.view','full'),
    ('manager','team.manage','full'), ('manager','settings.edit','full'), ('manager','audit.view','full'),
    ('manager','billing.manage','limited'),
    ('chef','menu.view','full'), ('chef','menu.edit','full'), ('chef','menu.price','full'),
    ('chef','kitchen.track','full'), ('chef','reports.menu','full'), ('chef','inventory.view','full'),
    ('chef','inventory.edit','full'), ('chef','suppliers.manage','full'),
    ('cashier','menu.view','full'), ('cashier','orders.take','full'), ('cashier','orders.cancel','limited'),
    ('cashier','orders.discount','limited'), ('cashier','orders.refund','limited'), ('cashier','orders.pay','full'),
    ('cashier','cash.count','full'), ('cashier','reports.own','full'),
    ('bartender','menu.view','full'), ('bartender','orders.take','full'), ('bartender','kitchen.track','full'),
    ('bartender','orders.cancel','limited'), ('bartender','orders.discount','limited'), ('bartender','orders.refund','limited'),
    ('bartender','orders.pay','full'), ('bartender','cash.count','full'), ('bartender','reports.own','full'),
    ('bartender','inventory.view','full'),
    ('reception','menu.view','full'), ('reception','orders.take','full'), ('reception','orders.cancel','limited'),
    ('reception','orders.discount','limited'), ('reception','orders.refund','limited'), ('reception','orders.pay','full'),
    ('reception','cash.count','full'), ('reception','reports.own','full'),
    ('waiter','menu.view','full'), ('waiter','orders.take','full'), ('waiter','orders.cancel','limited'),
    ('waiter','orders.discount','limited'), ('waiter','orders.pay','limited'), ('waiter','reports.own','full'),
    ('cook','menu.view','full'), ('cook','kitchen.track','full'), ('cook','inventory.view','full'),
    ('crew','menu.view','full'), ('crew','orders.take','full'), ('crew','kitchen.track','full'),
    ('crew','orders.cancel','limited'), ('crew','orders.discount','limited'), ('crew','orders.refund','limited'),
    ('crew','orders.pay','full'), ('crew','cash.count','full'), ('crew','reports.own','full'),
    ('crew','inventory.view','full'),
    ('sales','menu.view','full'), ('sales','orders.take','full'), ('sales','orders.cancel','limited'),
    ('sales','orders.discount','limited'), ('sales','orders.refund','limited'), ('sales','orders.pay','full'),
    ('sales','cash.count','full'), ('sales','reports.own','full'),
    ('production','menu.view','full'), ('production','kitchen.track','full'), ('production','inventory.view','full')
  ;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_permission_level(p_tenant uuid, p_perm text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_niveau text;
BEGIN
  IF p_perm IS NULL OR NOT (p_perm = ANY (private.codes_droits())) THEN RETURN NULL; END IF;
  IF NOT public.mfa_satisfait() THEN RETURN NULL; END IF;
  SELECT n.niveau INTO v_niveau
  FROM public.admin_users AS au
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN 'owner' = ANY (au.postes) THEN 'full'
      WHEN au.permission_overrides ? p_perm THEN
        CASE WHEN (au.permission_overrides -> p_perm) = 'true'::jsonb THEN 'full' END
      ELSE (
        SELECT CASE max(CASE x.niveau WHEN 'full' THEN 2 WHEN 'limited' THEN 1 ELSE 0 END)
                 WHEN 2 THEN 'full' WHEN 1 THEN 'limited' END
        FROM (
          SELECT CASE
                   WHEN pp.permissions ? p_perm THEN
                     CASE WHEN (pp.permissions -> p_perm) = 'true'::jsonb THEN 'full' END
                   ELSE m.niveau
                 END AS niveau
          FROM unnest(au.postes) AS p(poste)
          LEFT JOIN public.poste_permissions AS pp
                 ON pp.tenant_id = au.tenant_id AND pp.poste = p.poste
          LEFT JOIN private.matrice_postes() AS m
                 ON m.poste = p.poste AND m.droit = p_perm
        ) AS x
      )
    END AS niveau
  ) AS n
  WHERE au.user_id = (SELECT auth.uid())
    AND au.tenant_id = p_tenant
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND n.niveau IS NOT NULL
  ORDER BY (n.niveau = 'full') DESC
  LIMIT 1;
  RETURN v_niveau;
END;
$function$;

COMMIT;
