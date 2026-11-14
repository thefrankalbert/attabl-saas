-- A-04 (audit d'intrusion du 2026-11-12): desactiver un membre ne coupait pas sa
-- session. Cette fonction supprime toutes les sessions d'un compte auth; la
-- suppression de auth.sessions entraine celle des refresh tokens (cle etrangere
-- en cascade), et GoTrue refuse ensuite le jeton d'acces a la prochaine requete.
--
-- Appelee uniquement par le client service_role (src/services/member-session.service.ts)
-- apres un controle d'autorisation applicatif. Idempotente.
-- Rollback: DROP FUNCTION public.revoke_user_sessions(uuid);

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
  RETURN revoked;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
