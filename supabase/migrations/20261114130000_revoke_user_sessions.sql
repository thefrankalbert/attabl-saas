-- A-04 (audit d'intrusion du 2026-11-12): desactiver un membre ne coupait pas sa
-- session. Cette fonction supprime toutes les sessions d'un compte auth ainsi que
-- ses refresh tokens: la suppression de auth.sessions entraine celle des refresh
-- tokens rattaches (cle etrangere en cascade), et on supprime aussi explicitement
-- ceux dont session_id est NULL (anciens jetons, non couverts par la cascade).
--
-- CE QUE CELA GARANTIT, ET CE QUE CELA NE GARANTIT PAS. Le jeton d'acces (JWT)
-- deja emis reste valide pour PostgREST jusqu'a son expiration (1 heure par
-- defaut): ce qui est coupe ici, c'est le RENOUVELLEMENT et la validation de
-- session cote GoTrue (auth.getUser()). Contre un jeton encore vivant, la
-- protection d'un membre desactive repose sur les policies RLS (membre
-- is_active) et sur les gardes serveur, qui refusent deja un membre inactif.
--
-- Appelee uniquement par le client service_role (src/services/member-session.service.ts)
-- apres un controle d'autorisation applicatif. Idempotente.
-- Rollback: DROP FUNCTION public.revoke_user_sessions(uuid);

BEGIN;

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  DELETE FROM auth.refresh_tokens
    WHERE user_id = p_user_id::text AND session_id IS NULL;
  RETURN revoked;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

COMMIT;
