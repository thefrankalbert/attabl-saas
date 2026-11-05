-- SVC-12 / refutation R1 du contre-audit LOT 2 - l'invitant peut LIRE le jeton
-- de l'invitation qu'il vient de creer, et donc accepter a la place du
-- titulaire (prise de controle d'une ligne admin_users sur le compte d'un
-- tiers, sans son consentement).
--
-- Etabli par lecture du depot (aucune base interrogee):
--   1. la politique "tenant_admins_can_view_invitations"
--      (20260218000000_invitations_permissions.sql l. 26-33) ouvre a tout
--      owner/admin du tenant la LIGNE ENTIERE des invitations de son tenant.
--      La RLS filtre des lignes, jamais des colonnes: la colonne token est
--      donc comprise dedans;
--   2. aucune migration du depot n'accorde ni ne retire de privilege sur
--      public.invitations:
--        grep -niE "(grant|revoke)[^;]*invitations" supabase/migrations/
--        -> aucune sortie;
--   3. les privileges par defaut du schema d'origine donnent ALL ON TABLES a
--      anon et authenticated (supabase/schema.sql l. 4043-4046). Les droits de
--      SELECT de `authenticated` sur invitations sont donc entiers;
--   4. les routes applicatives retirent bien le jeton de leurs reponses
--      (src/app/api/invitations/route.ts l. 81 et 253), mais l'attaquant n'a
--      pas besoin d'elles: la cle anon est publique (NEXT_PUBLIC_*) et il
--      possede son propre JWT de session, donc
--      GET /rest/v1/invitations?select=token&email=eq.<victime> lui repond.
--
-- Meme cause, deuxieme effet (reserve S1): la politique UPDATE est elle aussi
-- sans restriction de colonne (meme fichier, l. 44-51). Un admin pouvait creer
-- une invitation 'manager', la passer a 'admin' par
-- PATCH /rest/v1/invitations?id=eq.<id>, puis la faire accepter: la RPC
-- accept_invitation_membership insere le role lu sur la ligne
-- (20260702120000 l. 58), donc canGrantRole etait contourne.
--
-- La RLS ne sait pas restreindre une colonne. On agit donc au niveau des
-- privileges, comme 20260420000003 (admin_users) et 20260731000100 (tenants).
--
-- ADDITIF ET SANS EFFET SUR LE CODE DEPLOYE, verifie avant ecriture: TOUS les
-- acces applicatifs a public.invitations passent par createAdminClient()
-- (service_role), qui ignore RLS et privileges de colonne:
--   src/services/invitation.service.ts, appele uniquement avec le client admin
--   depuis api/invitations/route.ts (l. 72, 202), validate/route.ts (l. 35),
--   accept/route.ts, [id]/route.ts (l. 43, 74) et [id]/resend/route.ts (l. 44,
--   75). Aucune lecture ni ecriture de invitations depuis le navigateur.
-- Le code fonctionne donc avant comme apres cette migration (regle du depot:
-- le code est deploye avant la migration).
--
-- Realtime: public.invitations n'appartient PAS a la publication
-- supabase_realtime (verifie: aucune migration ne l'y ajoute). Les privileges
-- de colonne ne s'appliquant pas au CDC, il n'y a donc rien a retirer ici.
--
-- Idempotent: REVOKE et GRANT sont des etats, pas des evenements; rejouer ce
-- fichier n'a aucun effet supplementaire.
--
-- Rollback (deconseille - reouvre la lecture du jeton):
--   grant select, insert, update on table public.invitations to authenticated;

revoke all on table public.invitations from authenticated;
revoke all on table public.invitations from anon;

-- Liste blanche de lecture pour `authenticated`: toutes les colonnes SAUF
-- token. Aucune ecriture n'est re-accordee (ni INSERT ni UPDATE ni DELETE):
-- la creation, le renvoi et l'annulation d'une invitation passent par les
-- routes serveur en service_role.
grant select (
  id,
  tenant_id,
  email,
  role,
  custom_permissions,
  invited_by,
  expires_at,
  status,
  created_at,
  accepted_at
) on table public.invitations to authenticated;

-- Normalisation de la casse des adresses (reserve S4). `.eq()` est sensible a
-- la casse en Postgres: une invitation "Victime@X.com" ne retrouvait pas un
-- compte enregistre "victime@x.com". Les schemas Zod minusculisent desormais a
-- l'ecriture (createInvitationSchema, createAdminUserSchema,
-- updateUserEmailSchema); ces deux UPDATE alignent les lignes existantes.
-- admin_users.email et invitations.email sont des colonnes MIROIR applicatives
-- (l'identite de connexion vit dans auth.users): la seule difference visible
-- est la casse affichee dans la liste d'equipe.
-- Non reversible quant a la casse d'origine: elle n'est pas conservee.
--
-- invitations.email ne porte aucune contrainte d'unicite (seul token est
-- UNIQUE, 20260218000000 l. 12): la mise en minuscules ne peut pas echouer.
update public.invitations
  set email = lower(email)
  where email <> lower(email);

-- admin_users porte en revanche un index UNIQUE (tenant_id, email)
-- (schema.sql l. 1934). Une collision est tres improbable - GoTrue minusculise
-- l'adresse du compte auth, donc deux comptes du meme tenant ne differant que
-- par la casse n'ont pas pu etre crees - mais une migration ne doit pas PARIER
-- la-dessus: la clause NOT EXISTS laisse de cote une ligne qui entrerait en
-- collision plutot que de faire echouer tout le fichier. Le code gere les deux
-- casses a la lecture (invitation.service.ts), donc une ligne laissee de cote
-- reste fonctionnelle.
update public.admin_users as a
  set email = lower(a.email)
  where a.email <> lower(a.email)
    and not exists (
      select 1 from public.admin_users as b
      where b.tenant_id = a.tenant_id
        and b.email = lower(a.email)
        and b.id <> a.id
    );

-- REPERABILITE des lignes laissees de cote (reserve S7' du contre-audit LOT 4).
-- Le NOT EXISTS ci-dessus reste le bon choix - une migration ne doit pas
-- echouer en entier sur une collision - mais une ligne ignoree est justement
-- l'etat qui declenchait la reserve S1' (deux lignes du meme tenant ne differant
-- que par la casse). Ce bloc ne modifie rien: il rend l'ecart VISIBLE dans la
-- sortie de `supabase db push`, au lieu de le laisser passer en silence.
-- Requete de controle a rejouer apres application:
--   select id, tenant_id, email from public.admin_users where email <> lower(email);
do $$
declare
  v_restantes integer;
begin
  select count(*) into v_restantes
  from public.admin_users
  where email <> lower(email);

  if v_restantes > 0 then
    raise warning 'invitations_token_not_readable: % ligne(s) admin_users laissees en casse mixte (collision avec idx_admin_users_email_tenant). Controle: select id, tenant_id, email from public.admin_users where email <> lower(email);', v_restantes;
  end if;
end
$$;
