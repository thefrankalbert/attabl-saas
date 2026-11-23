-- ============================================================================
-- Audit B6 et B42: un prix de plat ne peut pas etre negatif.
--
-- CE QUI NE TENAIT PAS. `menu_items.price` (numeric(10,2) NOT NULL) n'a aucune
-- contrainte en base (verifie en production par l'orchestrateur le 21/11: la
-- seule contrainte de prix existante est sur `item_modifiers`). Plusieurs
-- chemins d'ecriture validaient mal le prix (action de modification rapide du
-- prix, import PDF): un plat a -5000 FCFA pouvait etre enregistre puis
-- commande. Le code est corrige dans le meme lot; cette contrainte est le filet
-- pour tous les autres chemins.
--
-- PRUDENCE SUR LES DONNEES EXISTANTES. La contrainte est posee NOT VALID: elle
-- s'applique tout de suite a toute nouvelle ecriture, sans relire la table. On
-- tente ensuite de la VALIDER; si une ligne existante est negative, la
-- validation est abandonnee (la contrainte reste active pour les ecritures) et
-- un NOTICE le dit. Le nombre de lignes fautives se lit par:
--   select count(*) from public.menu_items where price < 0;
--
-- ADDITIVE. Peut passer AVANT ou APRES le deploiement du code. Seule
-- consequence: une ecriture d'un prix negatif, qui etait un defaut, echoue.
--
-- ROLLBACK: ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_price_non_negative;
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND conname = 'menu_items_price_non_negative'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_price_non_negative CHECK (price >= 0) NOT VALID;
  END IF;

  BEGIN
    ALTER TABLE public.menu_items VALIDATE CONSTRAINT menu_items_price_non_negative;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'menu_items_price_non_negative: des prix negatifs existent, contrainte laissee NOT VALID (active pour les nouvelles ecritures)';
  END;
END;
$$;
