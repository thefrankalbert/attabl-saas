-- R5 / T9 (lot 8): les e-mails de relance (premiere commande, dixieme commande,
-- fin d'essai proche, relance d'inactivite) partaient sans moyen de se
-- desinscrire. Cette colonne porte le choix de la personne.
--
-- `lifecycle_emails_opt_out_at`: date de la desinscription, NULL = la personne
-- recoit les relances. Une date plutot qu'un booleen: on sait QUAND le choix a
-- ete fait (preuve en cas de reclamation). Portee: une ligne `admin_users`,
-- donc une personne DANS un restaurant (le lien de desinscription est emis pour
-- cette ligne, l'e-mail parle de ce restaurant).
--
-- QUI ECRIT. Uniquement le serveur, en service_role, depuis la route publique
-- /api/email/unsubscribe, apres verification d'un jeton signe (HMAC). Le role
-- `authenticated` n'a plus de privilege UPDATE de table sur admin_users depuis
-- 20260420000003 (seulement une liste blanche de colonnes): une colonne ajoutee
-- n'y figure pas, elle n'est donc PAS inscriptible par un membre. Le REVOKE de
-- colonne ci-dessous le rend explicite et survit a un re-grant de colonne
-- accidentel. Lecture: inchangee (memes policies SELECT que le reste de la
-- ligne); la valeur n'est pas sensible.
--
-- Pas d'index: la colonne n'est lue qu'en filtre sur le proprietaire d'un
-- restaurant deja selectionne par tenant_id (quelques lignes).
--
-- ORDRE: AVANT le code (additif; le code ancien ignore la colonne).
-- Rejouable: ADD COLUMN IF NOT EXISTS, COMMENT et REVOKE sont idempotents.
-- Retour arriere: ALTER TABLE public.admin_users DROP COLUMN IF EXISTS lifecycle_emails_opt_out_at;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS lifecycle_emails_opt_out_at timestamptz NULL;

COMMENT ON COLUMN public.admin_users.lifecycle_emails_opt_out_at IS
  'Date de desinscription des e-mails de relance (R5/T9). NULL = abonne. Ecrite par le serveur seul (service_role, jeton signe).';

REVOKE UPDATE (lifecycle_emails_opt_out_at) ON TABLE public.admin_users FROM authenticated;
REVOKE UPDATE (lifecycle_emails_opt_out_at) ON TABLE public.admin_users FROM anon;
