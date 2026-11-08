-- ============================================================================
-- La matrice de la base rejoint celle du produit, et les montants deviennent
-- non reecrivables apres creation
-- ============================================================================
--
-- CE QUE CETTE MIGRATION REMPLACE. Une version precedente de ce fichier
-- (`20261107210000_delegation_pas_sur_les_commandes.sql`) retirait
-- `orders.manage` de la delegation, faute de savoir fermer autrement le chemin
-- des montants. Elle n'a ete appliquee dans AUCUN environnement, et elle etait
-- FAUSSE: elle contredisait le produit, qui documente explicitement dans
-- `src/lib/admin-roles.ts` qu'un caissier detient `orders.manage` et qu'une
-- garde plus etroite que la matrice est un defaut deja vecu ("la caisse ne
-- pouvait pas faire avancer une commande"). Elle est donc supprimee, pas
-- corrigee: cette migration fait le travail a sa place.
--
-- ----------------------------------------------------------------------------
-- 1. DEUX ECARTS MESURES ENTRE LA MATRICE DE L'APP ET CELLE DE LA BASE
-- ----------------------------------------------------------------------------
--
-- La garde `has_tenant_write_permission` n'est interrogee que pour quatre
-- permissions (`menu.edit`, `orders.manage`, `inventory.edit`,
-- `settings.edit`). Son defaut etait `admin` ou `manager` pour les quatre, ce
-- qui divergeait de `DEFAULT_PERMISSIONS` (src/types/permission.types.ts), la
-- source de verite de l'application, dans LES DEUX SENS:
--
--   | permission      | l'app accorde a                  | la base accordait a      |
--   | --------------- | -------------------------------- | ------------------------ |
--   | menu.edit       | owner, admin, manager            | owner, admin, manager    |
--   | inventory.edit  | owner, admin, manager            | owner, admin, manager    |
--   | orders.manage   | owner, admin, manager, cashier,  | owner, admin, manager    |
--   |                 | chef                             | <- LA CAISSE MANQUAIT    |
--   | settings.edit   | owner, admin                     | owner, admin, manager    |
--   |                 |                                  | <- PLUS PERMISSIF        |
--
-- Consequences MESUREES des deux ecarts:
--
--   a) `orders.manage`: un caissier encaissait depuis l'ecran POS
--      (`/api/orders/pos` ecrit avec le client admin, donc hors RLS) mais
--      etait REFUSE en encaissant depuis la note (`actionRecordTender` ecrit
--      avec le jeton de l'employe, donc sous RLS, et `payments_tenant_insert`
--      exige `orders.manage`). La caisse etait a moitie cassee en production
--      depuis l'application de `20261107120000`.
--
--   b) `settings.edit`: un gerant pouvait ecrire les reglages du restaurant
--      directement par l'API alors que l'application le lui refuse. L'ecart
--      allait donc dans le sens d'une PERMISSION DE TROP.
--
-- Le defaut devient donc la matrice du produit, permission par permission. Le
-- `owner` n'atteint jamais ce bloc (il est court-circuite au-dessus). Une
-- permission inconnue de cette liste garde l'ancien defaut `admin`/`manager`:
-- la garde n'est aujourd'hui appelee qu'avec les quatre ci-dessus, et refuser
-- l'inconnu casserait tout futur appel au lieu de le proteger.
--
-- CONTRE LA DERIVE: `supabase/tests/rls/garde_argent.test.sql` epingle cette
-- matrice role par role. Si quelqu'un modifie `DEFAULT_PERMISSIONS` sans
-- toucher ici, le test tombe.
--
-- ----------------------------------------------------------------------------
-- 2. POURQUOI LES MONTANTS DOIVENT ETRE PROTEGES EN MEME TEMPS
-- ----------------------------------------------------------------------------
--
-- Rendre `orders.manage` au caissier rouvre le chemin trouve par la revue de
-- securite: les gardes argent de `20261107190000` et `20261107200000` portent
-- sur le LIBELLE d'une commande (`payment_status`, `is_comp`), pas sur ses
-- MONTANTS. Un caissier pouvait donc poser `total = 0` sur une note existante
-- puis l'encaisser: l'effet economique d'un offert, obtenu par une autre
-- colonne, en contournant la garde de l'offert. Aucune policy ne peut fermer
-- ce chemin: une policy ne lit pas les colonnes MODIFIEES, seulement la ligne
-- resultante, et une note a legitimement un total variable.
--
-- Les deux moities arrivent donc dans UNE SEULE migration, donc une seule
-- transaction. Les separer laisserait, entre les deux, une fenetre ou la
-- caisse est rendue au caissier sans que les montants soient proteges.
--
-- POURQUOI `current_user` ET PAS `auth.role()`. Mesure faite sur une vraie
-- stack Supabase locale portant le schema de production:
--
--   | contexte                            | current_user  |
--   | ----------------------------------- | ------------- |
--   | employe connecte (jeton utilisateur)| authenticated |
--   | convive non connecte                | anon          |
--   | caisse POS (client service_role)    | service_role  |
--   | dans une fonction SECURITY DEFINER  | postgres      |
--   | migration, maintenance              | postgres      |
--
-- Tester `current_user` exempte donc AUTOMATIQUEMENT la caisse POS, les
-- chemins SECURITY DEFINER (`record_refund`) et les migrations, et ne
-- contraint que les deux roles joignables par un client. C'est un mecanisme
-- Postgres pur: il ne depend pas du schema `auth`, dont une base jetable ne
-- donne qu'un ersatz - c'est precisement ce qui avait empeche de valider ce
-- declencheur la premiere fois.
--
-- La liste des roles contraints est POSITIVE (`authenticated`, `anon`) et non
-- une liste d'exemptions. Raison: l'attaque passe par PostgREST avec un jeton,
-- et PostgREST ne bascule que vers ces deux roles. Tout autre `current_user`
-- signifie que l'appel a deja traverse du code de confiance. Une liste
-- d'exemptions attraperait au contraire les roles internes de Supabase
-- (replication, `supabase_admin`) et casserait des operations de plateforme.
--
-- `tip_amount` reste ECRIVABLE: c'est la seule colonne d'argent qu'un chemin
-- applicatif modifie apres creation (`order-lifecycle.ts`, `markPaid`). Verifie
-- avant d'ecrire ce declencheur: aucun chemin applicatif n'ecrit `total`,
-- `subtotal`, `discount_amount` ni `service_charge_amount` sur une commande
-- existante, et aucun declencheur ne recalcule les totaux (ajouter un plat ne
-- reecrit donc pas `total`). Refuser ces quatre colonnes ne retire aucune
-- capacite qui fonctionne.
--
-- Le refus LEVE (`42501`) au lieu de masquer la ligne: un declencheur
-- BEFORE UPDATE qui retournerait NULL annulerait l'ecriture en silence, et un
-- encaissement silencieusement perdu est pire qu'un refus visible.
--
-- LIMITE ASSUMEE DE LA FORME CHOISIE, et son chemin de sortie. Ce declencheur
-- est une LISTE NOIRE: il nomme les colonnes a proteger, donc toute colonne
-- ajoutee demain a `orders` est libre par defaut. Une liste BLANCHE - n'autoriser
-- que les colonnes que l'application ecrit reellement, et refuser le reste -
-- serait fail-closed, donc structurellement meilleure. Elle n'est pas posee ici
-- parce qu'elle exige d'enumerer EXACTEMENT toutes les colonnes que les chemins
-- applicatifs ecrivent: en oublier une empecherait un restaurant de servir, ce
-- qui est un risque plus grand que celui qu'elle retire. A faire quand cet
-- inventaire sera mesure, pas devine.
--
-- Les colonnes couvertes aujourd'hui sont celles qui portent de l'argent ou qui
-- decident de la journee comptable: les quatre montants, le pourboire, l'etat
-- de reglement, l'horodatage du paiement, le moyen de paiement, la date de
-- creation, et le restaurant proprietaire.
--
-- ----------------------------------------------------------------------------
-- 3. LA CONFIGURATION DE SALLE DOIT SUIVRE, SINON LA SECTION 1 ELEVE UN
--    PRIVILEGE
-- ----------------------------------------------------------------------------
--
-- Neuf policies de `tables`, `zones` et `table_assignments` sont gardees par
-- `orders.manage` seul, alors que l'application exige EN PLUS la liste de
-- roles de gestion. Rendre `orders.manage` au caissier sans toucher a ces
-- policies lui ouvrirait la suppression de tables et de zones par l'API.
-- Detail et justification du nouveau garde: voir la section 3 du corps.
--
-- LES TROIS SECTIONS SONT INDISSOCIABLES. Chacune seule introduit un defaut:
--   1 seule -> le caissier peut remettre les montants a zero, et supprimer des
--              tables et des zones;
--   2 seule -> la caisse du caissier reste cassee en production;
--   3 seule -> aucun effet utile.
-- Elles arrivent donc dans UNE migration, donc une seule transaction.
--
-- ROLLBACK (dans cet ordre):
--   DROP TRIGGER IF EXISTS trg_montants_commande_non_reecrits ON public.orders;
--   DROP FUNCTION IF EXISTS public.refuser_reecriture_montants_commande();
--   DROP TRIGGER IF EXISTS trg_creation_commande_non_reglee ON public.orders;
--   DROP FUNCTION IF EXISTS public.normaliser_creation_commande();
--   ALTER TABLE public.orders
--     DROP CONSTRAINT IF EXISTS orders_montants_non_negatifs_check;
--   -- reposer les 9 policies de salle sur
--   --   has_tenant_write_permission(tenant_id, 'orders.manage')
--   -- avec leurs anciens noms ("Order managers can ..." / "Table managers
--   -- can ..."), puis DROP FUNCTION public.has_tenant_floor_permission(uuid);
--   -- enfin reposer le corps de 20261107170000 (defaut admin/manager partout).
--   -- ATTENTION: cela recasse la caisse du caissier ET rouvre `total = 0`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La matrice par defaut de la base rejoint celle du produit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.role_permissions rp
      ON rp.tenant_id = au.tenant_id AND rp.role = au.role
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND (
        au.role = 'owner'
        OR CASE
             -- Surcharge individuelle de l'employe: elle tranche, dans les
             -- deux sens, pour n'importe quel role.
             WHEN au.custom_permissions ? p_perm
               THEN (au.custom_permissions -> p_perm) = 'true'::jsonb
             -- Puis la surcharge de role posee par le proprietaire pour ce
             -- tenant, qui tranche aussi dans les deux sens.
             WHEN rp.permissions ? p_perm
               THEN (rp.permissions -> p_perm) = 'true'::jsonb
             -- Sans aucune surcharge: la matrice du produit
             -- (DEFAULT_PERMISSIONS, src/types/permission.types.ts).
             ELSE CASE p_perm
                    WHEN 'orders.manage'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier', 'chef'])
                    WHEN 'settings.edit'
                      THEN au.role = 'admin'
                    WHEN 'menu.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    WHEN 'inventory.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- Permission hors des quatre que la base interroge: on
                    -- garde l'ancien defaut plutot que de casser l'appel.
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$$;

-- CREATE OR REPLACE preserve les grants EXECUTE existants. On les repose quand
-- meme: un helper RLS qui perd `anon` ou `authenticated` ne durcit pas la RLS,
-- il la casse.
GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Les montants d'une commande ne se reecrivent pas apres sa creation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refuser_reecriture_montants_commande()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER est ESSENTIEL: en SECURITY DEFINER, `current_user` vaudrait
-- toujours le proprietaire de la fonction et la garde ne se declencherait
-- JAMAIS. C'est la difference entre un declencheur qui protege et un
-- declencheur decoratif.
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Ordre de REGLEMENT, pour distinguer un progres d'un retour en arriere.
  -- `comp` et `refunded` sont au-dela: ce sont des etats terminaux, et la
  -- policy UPDATE de 20261107190000 exige deja l'autorite argent pour produire
  -- une ligne qui les porte.
  rang_ancien integer;
  rang_nouveau integer;
BEGIN
  -- Seuls les deux roles joignables par un client sont contraints. Voir
  -- l'en-tete pour la mesure de `current_user` dans chaque contexte.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- --------------------------------------------------------------------------
  -- UNE COMMANDE NE CHANGE PAS DE RESTAURANT.
  -- --------------------------------------------------------------------------
  -- Sans cette borne, les gardes ci-dessous se contournaient par un deuxieme
  -- compte. Elles jugeaient l'autorite sur `NEW.tenant_id`, soit le restaurant
  -- que l'ECRITURE propose. Quelqu'un membre de deux restaurants - gerant dans
  -- B, caissier dans A - pouvait donc viser une commande de A (le USING de la
  -- policy passe: il y detient `orders.manage`), poser `tenant_id = B` (le
  -- WITH CHECK passe: il y detient aussi `orders.manage`), et toutes les
  -- gardes interrogeaient alors son autorite argent dans B, ou il l'a.
  -- Les groupes de restaurants existent dans ce produit: ce cas n'est pas
  -- theorique.
  --
  -- Deplacer une commande d'un restaurant a l'autre est en outre une violation
  -- d'isolation en soi. Mesure faite: AUCUN chemin applicatif ne reecrit
  -- `orders.tenant_id`. La borne ne retire donc aucune capacite reelle.
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION
      'Une commande ne change pas de restaurant'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.total IS DISTINCT FROM OLD.total
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.service_charge_amount IS DISTINCT FROM OLD.service_charge_amount
  THEN
    RAISE EXCEPTION
      'Les montants d''une commande ne se reecrivent pas apres sa creation'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Une commande REGLEE ne se deregle pas.
  -- --------------------------------------------------------------------------
  -- POURQUOI CECI PASSE AVANT LE POURBOIRE. Une premiere version ne gardait que
  -- le pourboire, et seulement quand `OLD.payment_status = 'paid'`. Elle se
  -- contournait en trois coups: repasser la commande payee en `pending`, ecrire
  -- le pourboire (OLD vaut alors `pending`, la garde ne voit rien), puis
  -- remettre `paid`. Elle ratait aussi `partial` entierement.
  --
  -- Et le dereglement ouvre bien pire que le pourboire: `markPaid` ne reagit
  -- qu'a `payment_status = 'pending'`. Un employe qui repasse une commande
  -- payee en attente peut donc la REENCAISSER, et le ledger `payments`
  -- compterait deux fois la meme recette.
  --
  -- UN RETOUR EN ARRIERE EST POURTANT LEGITIME - mesure, pas supposition.
  -- `recompute` (src/services/payment.queries.ts) rederive le statut depuis le
  -- ledger apres chaque ecriture, et peut donc repasser `paid` a `partial` ou
  -- `pending` APRES UN REMBOURSEMENT. Il tourne avec le jeton de l'employe,
  -- donc sous RLS. Mais un remboursement exige l'autorite argent
  -- (ORDER_MONEY_ROLES cote application, et un montant negatif ou un statut
  -- non-`completed` exige `has_tenant_money_permission` cote base): exempter
  -- cette autorite preserve donc exactement ce flux. Un encaissement ordinaire,
  -- lui, ne fait JAMAIS reculer le statut - il ajoute un tender positif.
  -- NULL est classe PLUS BAS que tout, et ce n'est pas un detail. Une premiere
  -- version le faisait tomber dans le `ELSE 3`, donc au-DESSUS de `paid`:
  -- passer une commande payee a NULL comptait comme un progres et etait
  -- autorise. Or `payment_status` EST nullable, et un NULL echappe au CHECK de
  -- la colonne (une contrainte est satisfaite quand elle vaut "inconnu", pas
  -- seulement quand elle est vraie). Mesure faite: une commande au statut NULL
  -- est invisible A LA FOIS des lectures de revenu (`= 'paid'`) et des impayes
  -- (`in ('pending','partial')`). Un employe pouvait donc faire DISPARAITRE
  -- une commande encaissee des deux cotes a la fois.
  rang_ancien := CASE
                   WHEN OLD.payment_status IS NULL          THEN -1
                   WHEN OLD.payment_status = 'pending'      THEN 0
                   WHEN OLD.payment_status = 'partial'      THEN 1
                   WHEN OLD.payment_status = 'paid'         THEN 2
                   ELSE 3
                 END;
  rang_nouveau := CASE
                    WHEN NEW.payment_status IS NULL         THEN -1
                    WHEN NEW.payment_status = 'pending'     THEN 0
                    WHEN NEW.payment_status = 'partial'     THEN 1
                    WHEN NEW.payment_status = 'paid'        THEN 2
                    ELSE 3
                  END;

  -- L'autorite est jugee sur le tenant PROPRIETAIRE (`OLD`), jamais sur celui
  -- que l'ecriture propose. La borne de tenant ci-dessus rend les deux egaux,
  -- mais les deux verrous valent mieux qu'un: si cette borne sautait un jour,
  -- les gardes resteraient jugees au bon endroit.
  IF rang_nouveau < rang_ancien
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Une commande reglee ne se deregle pas sans l''autorite argent'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Le pourboire reste ecrivable A L'ENCAISSEMENT, pas apres.
  -- --------------------------------------------------------------------------
  -- Mesure: les deux seuls chemins qui l'ecrivent (`markPaid` et
  -- `applyPosFinalState`) filtrent `payment_status = 'pending'`. Un pourboire
  -- ne s'ecrit donc legitimement que sur une commande ENCORE EN ATTENTE, dans
  -- le meme UPDATE que la bascule. La borne porte sur `<> 'pending'` et non sur
  -- `= 'paid'`: sans cela, `partial`, `comp` et `refunded` passaient au travers.
  IF NEW.tip_amount IS DISTINCT FROM OLD.tip_amount
     AND coalesce(OLD.payment_status, '') <> 'pending'
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le pourboire ne se reecrit pas sur une commande deja reglee'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- L'HORODATAGE DU PAIEMENT NE SE DEPLACE PAS.
  -- --------------------------------------------------------------------------
  -- Trouve en relisant cette garde en adversaire, pas signale. `paid_at`
  -- decide du JOUR auquel une recette est comptee: le reecrire deplace de
  -- l'argent d'une journee a l'autre dans les rapports et fait echouer un
  -- rapprochement de caisse, sans qu'aucun montant ne change.
  --
  -- Figer un `paid_at` deja pose est EXACTEMENT l'invariant que l'application
  -- s'impose: `recompute` ne l'ecrit que s'il est absent
  -- (`becomesPaid && !order.paid_at`), et `markPaid` ne touche qu'une commande
  -- `pending`. Une commande deregle puis re-reglee garde donc l'horodatage de
  -- son PREMIER paiement, ici comme dans le code.
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
     AND OLD.paid_at IS NOT NULL
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'L''horodatage du paiement ne se reecrit pas'
      USING ERRCODE = '42501';
  END IF;

  -- Et il ne s'ANTIDATE pas au PREMIER reglement non plus. La borne ci-dessus
  -- ne gardait que la reecriture d'un horodatage DEJA pose: tant qu'il etait
  -- absent, l'appelant fournissait la date de son choix dans le meme UPDATE
  -- que la bascule, et deplacait la recette d'une journee a l'autre.
  --
  -- Ici on NORMALISE plutot que de refuser, et c'est voulu: les deux chemins
  -- applicatifs envoient deja `new Date()`, donc forcer `now()` ne change rien
  -- pour eux et retire la marge de manoeuvre a un appel direct. Un refus
  -- ferait echouer un encaissement legitime pour un ecart d'horloge de
  -- quelques secondes - un prix trop eleve pour la meme protection.
  --
  -- La normalisation n'est possible que parce que ce declencheur est BEFORE:
  -- en AFTER, `NEW` n'est plus modifiable.
  IF OLD.paid_at IS NULL
     AND NEW.paid_at IS NOT NULL
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    NEW.paid_at := now();
  END IF;

  -- --------------------------------------------------------------------------
  -- LE MOYEN DE PAIEMENT NE SE REECRIT PAS APRES LE REGLEMENT.
  -- --------------------------------------------------------------------------
  -- C'est le vecteur de vol le plus classique en caisse: encaisser en ESPECES,
  -- puis reetiqueter la commande en CARTE. Plus aucune espece n'est attendue
  -- dans le tiroir, donc le comptage ne signale aucun manque, et l'argent
  -- part.
  --
  -- Le registre `payments` porte lui aussi `method` et il est IMMUABLE (aucune
  -- policy UPDATE ni DELETE, par decision de 20261107190000), donc un
  -- rapprochement fait sur le registre voit la verite. Mais la colonne de la
  -- commande est ce que lisent les ecrans et les rapports: la laisser libre,
  -- c'est laisser mentir l'affichage.
  --
  -- Mesure: `markPaid` et `applyPosFinalState` n'ecrivent la methode qu'en
  -- basculant une commande `pending`, et aucun chemin ne la reecrit ensuite.
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
     AND coalesce(OLD.payment_status, '') <> 'pending'
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le moyen de paiement ne se reecrit pas apres le reglement'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- LA DATE DE CREATION NE SE DEPLACE PAS.
  -- --------------------------------------------------------------------------
  -- Les tableaux de bord et les rapports regroupent par `created_at`: le
  -- reecrire deplace une commande d'une journee de service a l'autre. Mesure:
  -- aucun chemin applicatif ne reecrit `orders.created_at` apres l'insertion.
  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'La date de creation d''une commande ne se deplace pas'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_montants_commande_non_reecrits ON public.orders;
CREATE TRIGGER trg_montants_commande_non_reecrits
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refuser_reecriture_montants_commande();

-- ----------------------------------------------------------------------------
-- 2bis. Une commande ne NAIT pas deja reglee
-- ----------------------------------------------------------------------------
--
-- PARITE AVEC L'UPDATE. Le declencheur ci-dessus ne garde que l'UPDATE, si bien
-- que tout ce qu'il protege etait librement fourni A LA CREATION: un role
-- client pouvait inserer une commande deja `paid`, horodatee la veille, avec le
-- moyen de paiement de son choix. L'effet economique est celui d'un
-- encaissement fabrique, et il echappait a toutes les bornes.
--
-- POURQUOI CE N'EST PAS DANGEREUX A POSER, et c'est une mesure qui le dit, pas
-- une intuition. AUCUN code applicatif n'insere directement dans `orders`: la
-- creation passe par la RPC `create_order_with_items`, qui est SECURITY
-- INVOKER - donc l'insertion a bien lieu en tant qu'`authenticated` et ce
-- declencheur s'y applique. Or cette RPC:
--
--   - code EN DUR `payment_status = 'pending'` (et `status = 'pending'`);
--   - ne mentionne NI `paid_at` NI `created_at` (verifie sur le corps STOCKE
--     de la fonction, pas sur une migration);
--   - n'a pas `payment_method` dans sa liste de colonnes.
--
-- Forcer exactement ces valeurs est donc IDENTIQUE a ce que l'application fait
-- deja: zero changement de comportement pour le vrai flux, et plus aucune marge
-- pour un appel direct a l'API.
--
-- ON NORMALISE AU LIEU DE REFUSER, pour la meme raison que l'horodatage: un
-- refus ferait echouer une creation legitime si un parametre inattendu
-- arrivait, alors que la normalisation donne toujours l'etat SUR - une commande
-- qui naît non reglee, donc dont l'argent reste DU. L'autorite argent reste
-- exemptee: c'est elle qui saisit une correction.
--
-- CE QUI N'EST TOUJOURS PAS GARDE A LA CREATION: l'egalite entre `total` et la
-- somme des lignes. Voir la section 4 - elle ne peut pas etre verifiee ici, les
-- `order_items` arrivant APRES la commande.

CREATE OR REPLACE FUNCTION public.normaliser_creation_commande()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER, pour la meme raison que le declencheur d'UPDATE: en
-- DEFINER, `current_user` vaudrait toujours le proprietaire et la garde ne se
-- declencherait jamais.
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.has_tenant_money_permission(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  NEW.created_at     := now();
  NEW.payment_status := 'pending';
  NEW.paid_at        := NULL;
  NEW.payment_method := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creation_commande_non_reglee ON public.orders;
CREATE TRIGGER trg_creation_commande_non_reglee
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.normaliser_creation_commande();

-- ----------------------------------------------------------------------------
-- 3. La configuration de salle reste au gerant
-- ----------------------------------------------------------------------------
--
-- POURQUOI CETTE SECTION FAIT PARTIE DU MEME CHANGEMENT. Neuf policies de
-- `tables`, `zones` et `table_assignments` sont gardees par
-- `has_tenant_write_permission(tenant_id, 'orders.manage')`. Or l'application
-- garde ces memes surfaces par une liste de roles GROSSIERE *en plus* de la
-- permission fine:
--
--   src/app/actions/tables.ts       ['owner', 'admin', 'manager'] + 'orders.manage'
--   src/app/actions/assignments.ts  ['owner', 'admin', 'manager'] + 'orders.manage'
--
-- Tant que le defaut de la base n'accordait `orders.manage` qu'a admin/manager,
-- les deux coincidaient PAR ACCIDENT. La section 1 rend `orders.manage` au
-- caissier et au chef: sans cette section, un caissier pourrait creer et
-- SUPPRIMER des tables et des zones en appelant l'API directement, alors que
-- l'application le lui refuse. Livrer la section 1 seule introduirait donc une
-- elevation de privilege - c'est pourquoi les trois sections sont
-- indissociables.
--
-- POURQUOI UN NOUVEAU GARDE ET PAS `has_tenant_money_permission`. Ce dernier a
-- exactement le meme corps aujourd'hui (role de gestion ET `orders.manage`), et
-- le reutiliser serait tentant. Mais il signifie "cette personne peut engager
-- de l'argent". Confondre les deux ferait qu'un futur changement des regles
-- d'argent deplacerait en silence qui configure la salle. Deux noms pour deux
-- intentions.
--
-- Les policies SELECT ne sont PAS touchees: lire le plan de salle reste ouvert
-- aux membres, et le personnel en a besoin pour servir.

CREATE OR REPLACE FUNCTION public.has_tenant_floor_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage');
$$;

-- Un helper RLS qui perd `anon` ou `authenticated` ne durcit pas la RLS, il la
-- casse: les policies s'evaluent alors en erreur de permission.
GRANT EXECUTE ON FUNCTION public.has_tenant_floor_permission(uuid)
  TO anon, authenticated, service_role;

-- zones
-- Les anciens noms ET les nouveaux sont retires: sans le second jeu, rejouer
-- cette migration echoue ("policy already exists"), l'ancien nom n'existant
-- plus. Mesure faite - le script d'application en production peut rejouer.
DROP POLICY IF EXISTS "Order managers can insert own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Order managers can update own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Order managers can delete own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Floor managers can insert own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Floor managers can update own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Floor managers can delete own tenant zones" ON public.zones;

CREATE POLICY "Floor managers can insert own tenant zones"
  ON public.zones
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(zones.tenant_id));

CREATE POLICY "Floor managers can update own tenant zones"
  ON public.zones
  FOR UPDATE
  USING (public.has_tenant_floor_permission(zones.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(zones.tenant_id));

CREATE POLICY "Floor managers can delete own tenant zones"
  ON public.zones
  FOR DELETE
  USING (public.has_tenant_floor_permission(zones.tenant_id));

-- tables
DROP POLICY IF EXISTS "Table managers can insert own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Table managers can update own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Table managers can delete own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Floor managers can insert own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Floor managers can update own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Floor managers can delete own tenant tables" ON public.tables;

CREATE POLICY "Floor managers can insert own tenant tables"
  ON public.tables
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(tables.tenant_id));

CREATE POLICY "Floor managers can update own tenant tables"
  ON public.tables
  FOR UPDATE
  USING (public.has_tenant_floor_permission(tables.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(tables.tenant_id));

CREATE POLICY "Floor managers can delete own tenant tables"
  ON public.tables
  FOR DELETE
  USING (public.has_tenant_floor_permission(tables.tenant_id));

-- table_assignments
DROP POLICY IF EXISTS "Order managers can insert own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Order managers can update own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Order managers can delete own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Floor managers can insert own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Floor managers can update own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Floor managers can delete own tenant assignments" ON public.table_assignments;

CREATE POLICY "Floor managers can insert own tenant assignments"
  ON public.table_assignments
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(table_assignments.tenant_id));

CREATE POLICY "Floor managers can update own tenant assignments"
  ON public.table_assignments
  FOR UPDATE
  USING (public.has_tenant_floor_permission(table_assignments.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(table_assignments.tenant_id));

CREATE POLICY "Floor managers can delete own tenant assignments"
  ON public.table_assignments
  FOR DELETE
  USING (public.has_tenant_floor_permission(table_assignments.tenant_id));

-- ----------------------------------------------------------------------------
-- 4. Un montant de commande n'est jamais negatif
-- ----------------------------------------------------------------------------
--
-- POURQUOI. Le declencheur de la section 2 ne garde que l'UPDATE. A la
-- CREATION, un porteur de `orders.manage` fournit les montants, et aucune
-- contrainte ne les bornait: `orders` ne portait AUCUN CHECK sur ses colonnes
-- d'argent (mesure: seuls `payment_method`, `payment_status`,
-- `preparation_zone`, `service_type` et `status` en avaient un). Un montant
-- negatif cree une recette negative dans les rapports, et un remboursement
-- deguise sans passer par le ledger `payments`.
--
-- Un montant negatif n'est jamais legitime: un remboursement s'inscrit comme
-- une ligne NEGATIVE dans `payments`, jamais comme un total negatif sur la
-- commande. Ces contraintes ne retirent donc aucune capacite reelle.
--
-- `NOT VALID` EST DELIBERE, PAS UN RACCOURCI. Une contrainte validee echoue si
-- une seule ligne existante la viole, et la migration entiere tomberait - sur
-- une base de production dont je ne peux pas inspecter les donnees d'ici. En
-- `NOT VALID`, la contrainte s'applique a toute ligne inseree ou modifiee
-- desormais, et les anciennes lignes sont laissees telles quelles. Pour les
-- valider ensuite, apres avoir constate qu'aucune ne viole la regle:
--
--   select count(*) from public.orders
--    where total < 0 or subtotal < 0 or coalesce(discount_amount, 0) < 0
--       or coalesce(service_charge_amount, 0) < 0 or coalesce(tip_amount, 0) < 0;
--   -- si 0: alter table public.orders validate constraint <nom>;
--
-- CE QUI RESTE NON GARDE, ET C'EST ASSUME ICI. L'egalite entre `total` et la
-- somme reelle des lignes de commande n'est PAS verifiee en base. Elle ne peut
-- pas l'etre a l'insertion (les `order_items` arrivent APRES la commande, par
-- clause etrangere), et une contrainte differee devrait reproduire tout le
-- calcul de prix - taxes, service, remises, modificateurs, variantes. Une
-- formule approchee empecherait un restaurant de servir. La verification des
-- prix reste donc cote serveur (`order.service.ts`, `calculateOrderTotal`), et
-- un employe appelant l'API directement la contourne. Cette surface existait
-- deja pour `admin` et `manager`; elle s'etend au caissier avec la section 1.
-- La fermer demande de deriver l'invariant exact du code de prix: c'est un
-- chantier a part, pas une ligne de migration.

-- POURQUOI PAS DE CONTRAINTE `payment_status IS NOT NULL` ICI, alors que le
-- NULL est bien un trou (une commande au statut NULL est invisible a la fois
-- des lectures de revenu et des impayes). Une contrainte `NOT VALID` tolere
-- les lignes EXISTANTES, mais elle s'applique a toute ligne INSEREE OU
-- MODIFIEE - y compris une vieille ligne qu'on met a jour. Si la production
-- porte ne serait-ce qu'une commande au statut NULL, elle deviendrait non
-- modifiable, et je ne peux pas inspecter ces donnees d'ici.
--
-- Le declencheur ci-dessus couvre la menace reelle (les roles clients), et les
-- chemins de confiance n'ecrivent jamais NULL - verifie: `deriveStatus`
-- (payment.calc.ts) ne rend que 'refunded', 'pending', 'partial' ou 'paid', et
-- la colonne a `'pending'` pour defaut. Le script d'application compte les
-- lignes NULL pour que la decision se prenne sur une mesure, pas sur une
-- supposition.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_montants_non_negatifs_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_montants_non_negatifs_check
  CHECK (
    total >= 0
    AND subtotal >= 0
    AND coalesce(discount_amount, 0) >= 0
    AND coalesce(service_charge_amount, 0) >= 0
    AND coalesce(tip_amount, 0) >= 0
  )
  NOT VALID;
