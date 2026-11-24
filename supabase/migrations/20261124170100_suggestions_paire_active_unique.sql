-- ============================================================================
-- Audit B97 (Basse): doublon de suggestion par double clic.
--
-- CE QUI NE TENAIT PAS. `createSuggestion` (suggestion.service.ts) lisait
-- "cette paire existe-t-elle deja ?" puis inserait, en deux requetes, sans
-- contrainte en base. Deux envois simultanes (double clic sur "Ajouter")
-- passaient tous deux la lecture et creaient deux lignes identiques.
--
-- LA CORRECTION. Index unique partiel sur la paire ACTIVE
-- (tenant_id, menu_item_id, suggested_item_id) WHERE is_active. Une suggestion
-- desactivee (suppression douce) ne bloque pas une nouvelle suggestion de la
-- meme paire. Le code traduit le 23505 en "Cette suggestion existe deja." et
-- desactive le bouton pendant l'envoi.
-- Compatibilite avec `regenerate_auto_suggestions` (20261124160200): elle
-- efface les lignes 'auto' du restaurant puis insere des paires deja
-- dedoublonnees par le code (generateSuggestions), en sautant toute paire
-- qu'une suggestion manuelle porte deja: elle ne peut pas heurter l'index.
--
-- LECTURE EN PRODUCTION (2026-11-24, lecture seule): 0 paire active en double
-- (5 lignes au total, 0 active). La creation de l'index ne peut donc pas
-- echouer sur l'existant.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code (additive). L'ancien code ne fait que
-- recevoir un refus 23505 sur un vrai doublon, qu'il affichait deja comme une
-- erreur; le nouveau code le traduit en message clair.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.item_suggestions_active_pair_key;
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS item_suggestions_active_pair_key
  ON public.item_suggestions (tenant_id, menu_item_id, suggested_item_id)
  WHERE is_active;
