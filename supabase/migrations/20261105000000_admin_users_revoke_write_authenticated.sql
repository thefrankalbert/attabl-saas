-- LOT 8 / R1 (CRITIQUE) - le role `authenticated` pouvait INSERER et SUPPRIMER
-- directement dans public.admin_users, avec la cle anon publique et un simple
-- JWT de session.
--
-- ETAT CONSTATE (dump de schema de production, supabase/schema.sql):
--
--   l. 3523  GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN
--              ON TABLE public.admin_users TO anon;
--   l. 3524  idem TO authenticated;
--   l. 2723  CREATE POLICY "Admins can manage own tenant admins"
--              ON public.admin_users
--              USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
--
-- La policy est un `FOR ALL` implicite SANS `WITH CHECK`: Postgres reutilise
-- alors l'expression `USING` comme `WITH CHECK` a l'INSERT. Tout membre ACTIF
-- d'un tenant (`get_my_tenant_ids_array()` ne filtre que `is_active`) pouvait
-- donc poser lui-meme sa ligne d'appartenance:
--
--   POST /rest/v1/admin_users
--   {"tenant_id":"<son tenant>","user_id":"<uid auth d un tiers>","role":"owner"}
--
-- sans invitation, sans jeton, sans consentement du titulaire, sans
-- `canGrantRole` (c'est une verification APPLICATIVE, rien ne l'applique sur ce
-- chemin), sans limite de plan et sans audit. Consequences mesurees par le
-- contre-audit:
--   - un serveur (`waiter`) devenait `owner` de son restaurant en une requete;
--   - il pouvait SUPPRIMER la ligne de son patron (`DELETE` etait accorde);
--   - toute la chaine de consentement construite par les lots d'invitation
--     etait contournable par ce chemin, et la remediation d'une ligne parasite
--     (retrait par la plateforme) etait annulable en la reinserant.
--
-- Seul `UPDATE` avait ete referme (20260420000003_lock_admin_privilege_columns),
-- et seule l'ELEVATION en super_admin etait bloquee par une policy RESTRICTIVE
-- (20260420000001) et un trigger (20260420020000). L'en-tete de cette derniere
-- migration ecrit "Today INSERT only happens via service_role so the exposure
-- is theoretical": la phrase decrit le code applicatif, pas les privileges.
-- Elle etait fausse.
--
-- ------------------------------------------------------------------------------
-- POURQUOI CE REVOKE NE CASSE RIEN (regle `feedback_migration_deploy_ordering`:
-- un REVOKE RETIRE un acces, donc il se verifie AVANT, pas apres).
--
-- Inventaire refait fichier par fichier, et non repris du rapport precedent.
-- Toutes les ECRITURES applicatives sur admin_users, et leur client Supabase:
--
--   src/app/actions/admin.ts:119        .insert()  -> createAdminClient()  (service_role)
--   src/app/actions/admin.ts:343        .update()  -> createAdminClient()  (service_role)
--   src/app/actions/admin.ts:683        .update()  -> createAdminClient()  (service_role)
--   src/services/signup.service.ts:99   .insert()  -> service instancie avec
--                                                     createAdminClient() aux 5
--                                                     points d'appel
--   src/services/platform-admin.service.ts:209/232/254/280  .update() -> service
--                                                     instancie avec
--                                                     createAdminClient() aux 11
--                                                     points d'appel
--
-- Aucun `.delete()` sur admin_users n'existe dans src/ (verifie: les
-- suppressions passent par la RPC `delete_admin_user_atomic`).
--
-- Les ecritures SQL sont toutes dans des fonctions SECURITY DEFINER, donc
-- executees sous l'identite du proprietaire et INSENSIBLES aux privileges de
-- l'appelant: `provision_signup_tenant`, `provision_group_restaurant`,
-- `accept_invitation_membership` (dont l'EXECUTE est deja retire a
-- anon/authenticated), `delete_admin_user_atomic`, `increment_login_count`.
--
-- Les seuls acces depuis le NAVIGATEUR (client.ts, donc role `authenticated`)
-- sont des LECTURES - `select('tenant_id')`, jointures `server:admin_users(...)`:
-- ChevaletEditor.tsx, useOrders.ts, useKitchenData.ts, useAssignments.ts,
-- useStockMovements.ts. `SELECT` n'est pas touche par cette migration.
--
-- Les `GRANT UPDATE(colonne)` existants sont CONSERVES tels quels: les retirer
-- sort du perimetre de ce constat et demanderait son propre inventaire. Il y en
-- a SIX, tous sur `authenticated` (supabase/schema.sql l. 3529, 3533, 3537,
-- 3541, 3545, 3549): full_name, is_active, last_login, phone, last_login_at et
-- login_count. Cette migration ne revoque PAS `update` a `authenticated`, donc
-- les six survivent (c'est important: en Postgres, un `revoke update on table`
-- emporte aussi les privileges de colonne). `anon`, lui, n'a AUCUN privilege de
-- colonne: le `revoke ... update ...` qui le concerne plus bas ne retire donc
-- rien d'existant, il verrouille seulement l'etat final.
--
-- Conclusion: aucun chemin applicatif n'insere ni ne supprime dans admin_users
-- autrement qu'avec le client service_role ou via une fonction SECURITY
-- DEFINER. Le revoke est sans effet sur le code, avant comme apres.
--
-- Migration ADDITIVE et IDEMPOTENTE: `revoke` et `create policy ... drop if
-- exists` decrivent un etat final, rejouables sans dommage.

-- ------------------------------------------------------------- 1. privileges

-- `authenticated`: plus aucune ecriture de ligne entiere.
revoke insert, delete, truncate, references, trigger on table public.admin_users
  from authenticated;

-- `anon`: aucune raison d'avoir le moindre droit d'ECRITURE sur cette table - il
-- n'y a pas de parcours public qui ecrit une appartenance. La migration
-- 20260731000500_revoke_anon_write_privileges le faisait deja pour toutes les
-- tables du schema public, mais le dump de production porte toujours les GRANT
-- (l. 3523), signe qu'elle n'y est pas appliquee. On le refait ici, cible, pour
-- que ce constat soit refermable independamment de l'etat de cette migration.
revoke insert, update, delete, truncate, references, trigger on table public.admin_users
  from anon;

-- ------------------------------------------------------- 2. policy explicite

-- Ceinture ET bretelles: meme si un privilege d'ecriture etait re-accorde un
-- jour (par un `grant ... on all tables`, un reset de privileges, ou une main
-- distraite), la policy ne doit plus servir de `WITH CHECK` par defaut. On
-- remplace la policy `FOR ALL` implicite par des policies PAR OPERATION, avec un
-- `WITH CHECK` ecrit.
drop policy if exists "Admins can manage own tenant admins" on public.admin_users;

-- SELECT reste porte par la policy existante "Admins can view own tenant admins"
-- (schema.sql l. 2819), qui ouvre aussi sa propre ligne a chaque membre
-- (`user_id = auth.uid()`). On ne la touche pas.

-- UPDATE: la ligne visee doit appartenir a un tenant de l'appelant AVANT comme
-- APRES l'ecriture. Sans le `WITH CHECK`, un admin pouvait deplacer une ligne de
-- son tenant vers un autre tenant (`tenant_id` n'est pas dans la liste blanche
-- des colonnes `GRANT UPDATE`, donc ce chemin etait deja ferme par les
-- privileges - le `WITH CHECK` le ferme par la policy, qui est la couche qui
-- survit a un re-grant).
create policy "Tenant admins update own tenant admin rows"
  on public.admin_users
  for update
  using (tenant_id = any (public.get_my_tenant_ids_array()))
  with check (tenant_id = any (public.get_my_tenant_ids_array()));

-- Pas de policy INSERT ni DELETE pour les roles clients: les deux operations
-- n'ont AUCUN appelant legitime hors service_role / SECURITY DEFINER (inventaire
-- ci-dessus). Absence de policy = refus, en plus du revoke de privilege.

-- -------------------------------------------- 3. une ligne retiree reste gelee
--
-- La remediation d'une ligne parasite est un soft-delete pose par la plateforme
-- (`platform-admin.service.ts`, `softDeleteAdminUser`: `deleted_at` + `is_active
-- = false`). Or `is_active` est restee inscriptible par `authenticated`
-- (`GRANT UPDATE("is_active")`), et aucune policy ne regarde `deleted_at`: un
-- admin du tenant pouvait donc REACTIVER la ligne que la plateforme venait de
-- retirer, et annuler la remediation.
--
-- Policy RESTRICTIVE (elle s'ajoute aux permissives, elle n'accorde rien): une
-- ligne retiree par la plateforme n'est plus modifiable par un role client. Sans
-- effet applicatif - toutes les ecritures passent par service_role, qui ignore
-- le RLS, et la console plateforme (`restoreAdminUser`) en fait partie.
--
-- JUSTEMENT PARCE QUE service_role ignore le RLS, cette policy ne suffit pas a
-- elle seule: le meme gel est pose cote applicatif par un filtre
-- `.is('deleted_at', null)` sur les deux chemins d'ecriture de
-- `src/app/actions/admin.ts` (`actionUpdateAdminUser`, `actionUpdateUserEmail`),
-- avec ses tests. Les deux couches couvrent deux chemins differents; aucune
-- n'est redondante.
drop policy if exists "Platform-removed admin rows are frozen for tenants" on public.admin_users;
create policy "Platform-removed admin rows are frozen for tenants"
  on public.admin_users
  as restrictive
  for update
  using (deleted_at is null or public.is_super_admin())
  with check (deleted_at is null or public.is_super_admin());
