-- ============================================================================
-- Audit B109 (Basse): `generate_menu_slug` translittere enfin "u accent grave"
-- en "u".
--
-- CE QUI NE TENAIT PAS. La chaine cible de TRANSLATE etait decalee d'un
-- caractere a partir de "u accent grave": source
-- `a-grave a-circ a-trema e-aigu e-grave e-circ e-trema i-trema i-circ o-circ
-- u-grave u-circ u-trema y-trema c-cedille n-tilde espace`, cible
-- `aaaeeeeiioouuycn-`. "u accent grave" devenait "o": une carte "Ou manger"
-- (u accent grave) recevait le slug `oo-manger`, visible dans l'URL `?menu=`.
--
-- LA CORRECTION. Cible `aaaeeeeiiouuuycn-` (17 caracteres, un par caractere
-- source). Les caracteres accentues sont ecrits en echappements Unicode
-- (`U&'\00E0...'`) pour garder ce fichier en ASCII; la chaine obtenue est
-- exactement celle de la production.
--
-- Corps repris du texte STOCKE en production (lu le 2026-11-23, identique a
-- `20260211000000_menu_hierarchy.sql` + `search_path` de `20260402000002`),
-- seule la chaine cible change. Meme signature, meme type de retour, SECURITY
-- INVOKER (pas de clause SECURITY en production), `search_path = public`,
-- memes droits (EXECUTE a PUBLIC, anon, authenticated, service_role).
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne. Les slugs deja
-- crees ne sont pas modifies (aucune modification de donnees).
--
-- ROLLBACK: rejouer la definition de `20260211000000_menu_hierarchy.sql`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_menu_slug(p_tenant_id uuid, p_name text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Transliterate accented chars and create slug
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(TRIM(p_name)),
        U&'\00E0\00E2\00E4\00E9\00E8\00EA\00EB\00EF\00EE\00F4\00F9\00FB\00FC\00FF\00E7\00F1 ',
        'aaaeeeeiiouuuycn-'
      ),
      '[^a-z0-9-]+', '-', 'g'
    )
  ));

  -- Remove consecutive dashes
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');

  -- Ensure non-empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'carte';
  END IF;

  final_slug := base_slug;

  -- Ensure uniqueness within tenant
  WHILE EXISTS (
    SELECT 1 FROM menus WHERE tenant_id = p_tenant_id AND slug = final_slug
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_menu_slug(uuid, text) TO PUBLIC, anon, authenticated, service_role;
