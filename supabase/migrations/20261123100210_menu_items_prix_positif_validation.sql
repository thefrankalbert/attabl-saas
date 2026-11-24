-- ============================================================================
-- Audit B6 et B42, suite de 20261123100200: validation de la contrainte
-- `menu_items_price_non_negative` sur les lignes EXISTANTES.
--
-- POURQUOI UNE MIGRATION A PART (contre-audit D4). Dans la meme transaction
-- que l'ajout, la validation se faisait sous le verrou exclusif pris par
-- `ADD CONSTRAINT`, garde jusqu'a la fin de la transaction: tout l'interet de
-- NOT VALID etait perdu. Chaque migration etant appliquee dans sa propre
-- transaction, `VALIDATE CONSTRAINT` ne prend ici qu'un verrou SHARE UPDATE
-- EXCLUSIVE: lectures et ecritures de `menu_items` continuent pendant le
-- parcours.
--
-- Si une ligne existante est negative, la validation est abandonnee: la
-- contrainte reste NOT VALID (toujours active pour les nouvelles ecritures)
-- et un NOTICE le dit. Lignes fautives:
--   select count(*) from public.menu_items where price < 0;
--
-- ADDITIVE. Peut passer AVANT ou APRES le deploiement du code, apres
-- 20261123100200. Rejouable sans erreur.
--
-- ROLLBACK: aucun (une validation ne se defait pas; voir 20261123100200).
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE public.menu_items VALIDATE CONSTRAINT menu_items_price_non_negative;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'menu_items_price_non_negative: des prix negatifs existent, contrainte laissee NOT VALID (active pour les nouvelles ecritures)';
END;
$$;
