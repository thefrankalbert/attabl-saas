-- Un restaurant gele ne peut plus etre actif. La regle devient une contrainte.
--
-- POURQUOI. `subscription_status = 'frozen'` veut dire "ce restaurant ne doit
-- plus fonctionner". `is_active = true` veut dire l'inverse. Les deux ensemble
-- sont contradictoires, et la contradiction a un cout: `get_tenant_by_slug`
-- filtre sur `is_active = true`, donc la vitrine d'un restaurant gele continue
-- de resoudre et de servir son menu.
--
-- Jusqu'ici la regle ne vivait que dans la discipline du code. Tous les chemins
-- de gel la respectent aujourd'hui - le cron `freeze-expired-trials` et les
-- trois chemins du webhook Stripe ecrivent bien `is_active: false` a cote de
-- `subscription_status: 'frozen'`. Mais rien ne l'IMPOSE: une ecriture depuis le
-- tableau de bord Supabase, un futur chemin oublie, ou un correctif mal relu
-- peuvent la rompre sans que rien ne proteste.
--
-- Et elle A DEJA ete rompue: une verification de l'existant a trouve des lignes
-- `frozen` ET `is_active`, sur des donnees d'essai anterieures a la correction du
-- cron. Aucun compte reel n'etait concerne - mais c'est la preuve que la
-- discipline seule ne suffit pas.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. Le schema documente un second invariant:
-- `freeze_reason` non nulle si et seulement si `frozen`. Il est viole par
-- quelques lignes, dont une ligne interne gelee par conception et sans cause a
-- declarer. L'imposer obligerait a inventer une valeur pour une ligne qui n'en a
-- pas, et `charge.dispute.closed` lit cette colonne pour decider quel gel il a le
-- droit de lever. On le laisse donc en l'etat, volontairement, plutot que de
-- forcer une valeur dont on ne mesure pas les effets sur ce chemin.
--
-- Rollback: `alter table public.tenants drop constraint tenants_gel_implique_inactif;`

-- 1. Normaliser les lignes existantes. Sans cela, l'ajout de la contrainte
--    echouerait - ce qui est le comportement voulu de PostgreSQL, et la raison
--    pour laquelle la correction des donnees fait partie de cette migration
--    plutot que d'etre laissee a un geste manuel qu'on oublierait.
update public.tenants
   set is_active = false
 where subscription_status = 'frozen'
   and is_active = true;

-- 2. Imposer la regle. NOT VALID n'est PAS utilise: on veut que la contrainte
--    verifie aussi l'existant, puisqu'on vient de le normaliser.
alter table public.tenants
  add constraint tenants_gel_implique_inactif
  check (subscription_status <> 'frozen' or is_active = false);

comment on constraint tenants_gel_implique_inactif on public.tenants is
  'Un tenant gele ne peut pas rester actif. La vitrine resout sur is_active (get_tenant_by_slug), donc un gel qui laisse is_active=true ne gele rien. Des lignes violaient cette regle avant que cette contrainte ne soit posee.';
