-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B119 (Moyenne). Une personne CONNECTEE qui
-- ouvre la vitrine d'un autre restaurant voit les supplements, options et
-- variantes de prix de ses plats.
--
-- CE QUI NE TENAIT PAS. Les lectures publiques de `item_modifiers`,
-- `item_options` et `item_price_variants` etaient reservees au role `anon`
-- (`20260622120000_rls_tenant_scope_hardening.sql`, puis
-- `20261112210000_intrusion_isolation_lot1.sql`). Le cookie de session est pose
-- sur `.attabl.com`, donc envoye a tous les sous-domaines, et la vitrine lit
-- avec le client a cookies (`sites/[site]/(storefront)/page.tsx`): un
-- restaurateur ou un employe connecte qui ouvre `b.attabl.com` est
-- `authenticated`, ne lit que les lignes de SES restaurants, et voit les plats
-- de B (lisibles par tous) sans aucune variante ni supplement.
--
-- LA CORRECTION. Les trois politiques valent `TO anon, authenticated`, avec la
-- MEME condition, recopiee du texte de production (lu le 2026-11-24,
-- `lot-b2b1/prod-politiques.txt`): l'enfant appartient au restaurant du plat,
-- le plat est disponible et non supprime. La sous-requete sur `menu_items`
-- reste soumise a la RLS de `menu_items` (dont la politique RESTRICTIVE
-- "Catalogue: restaurant visible ou membre"): un connecte ne voit que ce
-- qu'un visiteur anonyme voit deja. Les noms des politiques sont gardes.
-- Aucune ecriture n'est ouverte (politiques SELECT seulement).
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne (lecture elargie a
-- un role, aucun code ne change).
--
-- ROLLBACK: recreer les trois politiques avec `TO anon` (meme USING).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Item modifiers viewable by anon for available items" ON public.item_modifiers;
CREATE POLICY "Item modifiers viewable by anon for available items"
  ON public.item_modifiers
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
     WHERE mi.id = item_modifiers.menu_item_id
       AND mi.tenant_id = item_modifiers.tenant_id
       AND mi.is_available = true
       AND mi.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "Item options viewable by anon for available items" ON public.item_options;
CREATE POLICY "Item options viewable by anon for available items"
  ON public.item_options
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
     WHERE mi.id = item_options.menu_item_id
       AND mi.tenant_id = item_options.tenant_id
       AND mi.is_available = true
       AND mi.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "Price variants viewable by anon for available items" ON public.item_price_variants;
CREATE POLICY "Price variants viewable by anon for available items"
  ON public.item_price_variants
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
     WHERE mi.id = item_price_variants.menu_item_id
       AND mi.tenant_id = item_price_variants.tenant_id
       AND mi.is_available = true
       AND mi.deleted_at IS NULL
  ));

COMMIT;
