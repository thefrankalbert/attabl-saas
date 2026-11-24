-- ============================================================================
-- Audit verif-prod Q19 / C12 (Basse): plafond de l'e-mail "nouvelle connexion".
--
-- Apres une connexion reussie depuis un appareil inconnu (cookie signe absent),
-- l'application previent le titulaire par e-mail. Sans plafond, quelqu'un qui
-- connait le mot de passe et vide ses cookies a chaque essai ferait partir un
-- e-mail par connexion: une boite noyee, et la reputation du domaine usee.
--
-- LA CORRECTION. Une ligne par compte, avec la date de la derniere alerte, et
-- une fonction qui RESERVE atomiquement le droit d'envoyer (au plus une alerte
-- par heure et par compte). Atomique: deux connexions simultanees ne font
-- partir qu'un seul e-mail.
--
-- POURQUOI UNE FONCTION ET PAS LE CLIENT service_role. La route de connexion
-- n'a pas a manier la cle service_role. La fonction ne lit que `auth.uid()`:
-- un appelant ne peut reserver que pour SON compte, jamais pour un autre.
-- Aucune donnee personnelle stockee: un identifiant de compte et une date.
--
-- ISOLATION. RLS active, AUCUNE politique: la table n'est lisible ni ecrivable
-- par l'API. Seule la fonction (SECURITY DEFINER) y touche.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code. Purement additive. Si la fonction
-- manque, la connexion n'est pas bloquee: l'appel echoue, aucun e-mail ne part.
--
-- ROLLBACK:
--   DROP FUNCTION public.reserver_alerte_nouvelle_connexion();
--   DROP TABLE public.alertes_nouvelle_connexion;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.alertes_nouvelle_connexion (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  derniere_alerte_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alertes_nouvelle_connexion IS
  'Date de la derniere alerte de nouvelle connexion par compte (plafond 1 par heure). Ecrit par reserver_alerte_nouvelle_connexion() seulement.';

ALTER TABLE public.alertes_nouvelle_connexion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.alertes_nouvelle_connexion FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.alertes_nouvelle_connexion TO service_role;

CREATE OR REPLACE FUNCTION public.reserver_alerte_nouvelle_connexion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reserve boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Premiere connexion du compte depuis la mise en service de l'alerte: aucun
  -- appareil n'est encore connu (le cookie n'existait pas), on enregistre sans
  -- alerter. Sans cette regle, CHAQUE utilisateur existant recevait une alerte
  -- "nouvelle connexion" a sa premiere connexion apres le deploiement.
  IF NOT EXISTS (
    SELECT 1 FROM public.alertes_nouvelle_connexion WHERE user_id = v_uid
  ) THEN
    INSERT INTO public.alertes_nouvelle_connexion (user_id, derniere_alerte_at)
    VALUES (v_uid, now() - interval '2 hours')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN false;
  END IF;

  INSERT INTO public.alertes_nouvelle_connexion AS a (user_id, derniere_alerte_at)
  VALUES (v_uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET derniere_alerte_at = EXCLUDED.derniere_alerte_at
    WHERE a.derniere_alerte_at < now() - interval '1 hour'
  RETURNING true INTO v_reserve;

  RETURN coalesce(v_reserve, false);
END;
$$;

COMMENT ON FUNCTION public.reserver_alerte_nouvelle_connexion() IS
  'Reserve, pour le compte appelant (auth.uid()), le droit d envoyer une alerte de nouvelle connexion: false a la toute premiere connexion (amorcage, aucun appareil connu), puis true au plus une fois par heure.';

REVOKE ALL ON FUNCTION public.reserver_alerte_nouvelle_connexion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserver_alerte_nouvelle_connexion() TO authenticated, service_role;

COMMIT;
