-- Lot pourboires (audit du 2026-11-20, constats C, D et G).
--
-- C. Les pourboires n'apparaissaient dans aucun rapport: `get_order_summary`
--    renvoyait `total_tips`, mais sur la date de CREATION des commandes,
--    alors que les revenus suivent la date d'ENCAISSEMENT (registre
--    `payments`, migration 20261112140000). Les deux chiffres d'une meme
--    periode ne portaient donc pas sur les memes commandes. `total_tips` suit
--    desormais `orders.paid_at`, la date ou le pourboire est encaisse.
--    Signature inchangee: CREATE OR REPLACE garde les droits EXECUTE.
--
-- D. Pas de pourboires par serveur: `get_server_performance` gagne une colonne
--    `tips` (somme de `tip_amount` des commandes reglees du serveur, meme base
--    de date). Un type de retour ne change pas par CREATE OR REPLACE: la
--    fonction est supprimee puis recreee DANS LA MEME TRANSACTION, avec les
--    droits relus dans supabase/schema.sql (REVOKE PUBLIC, GRANT authenticated
--    et service_role). Une colonne en plus ne casse pas l'ancien code, qui lit
--    les colonnes par leur nom.
--
-- G. Un employe authentifie pouvait ecrire `tip_amount` directement sur une
--    commande en attente, quel que soit le plan. Le declencheur de garde des
--    commandes refuse desormais une HAUSSE du pourboire quand le plan ne
--    comprend pas les pourboires. Fonction recopiee A L'IDENTIQUE depuis
--    20261107210000 (derniere definition, aucune migration ulterieure ne la
--    redefinit), avec un seul bloc ajoute, signale dans le corps. La meme
--    regle est posee a la creation (`normaliser_creation_commande`).
--
-- Rejouable: CREATE OR REPLACE et DROP ... IF EXISTS partout.
--
-- Rollback: rejouer `get_order_summary` et `get_server_performance` de
-- 20261112140000 (DROP de la nouvelle `get_server_performance` d'abord, puis
-- remettre les memes droits), et `refuser_reecriture_montants_commande` de
-- 20261107210000, ainsi que `normaliser_creation_commande` de 20261107210000.
-- `tenant_peut_recevoir_pourboires` peut alors etre supprimee.

BEGIN;

-- ----------------------------------------------------------------------------
-- Le plan du restaurant comprend-il les pourboires ?
-- ----------------------------------------------------------------------------
-- Miroir EXACT de getPlanLimits(...).canAccessTips (src/lib/plans/features.ts):
--   - essai en cours (status 'trial' et fin dans le futur) -> plan Pro -> oui;
--   - abonnement inutilisable (ni 'trial', ni 'active', ni 'past_due') ->
--     plan Starter -> non;
--   - sinon le plan: Starter non, Pro / Business / Enterprise oui.
-- Changer l'un sans l'autre fait diverger l'interface et la base.
--
-- SECURITY DEFINER pour lire `tenants` quel que soit le droit de colonne de
-- l'appelant. Elle ne repond que pour un restaurant dont l'appelant est membre
-- actif: sinon `false`, si bien qu'elle ne revele le plan de personne
-- (les abonnements enumerables etaient un constat de novembre).
CREATE OR REPLACE FUNCTION public.tenant_peut_recevoir_pourboires(p_tenant uuid)
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
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant
      AND (
        (t.subscription_status = 'trial' AND t.trial_ends_at > now())
        OR (
          t.subscription_status IN ('trial', 'active', 'past_due')
          AND t.subscription_plan IN ('pro', 'business', 'enterprise')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_peut_recevoir_pourboires(uuid) FROM PUBLIC;
-- Le declencheur est SECURITY INVOKER: les deux roles qu'il contraint doivent
-- pouvoir appeler l'aide, sinon la garde echoue en "permission refusee".
GRANT EXECUTE ON FUNCTION public.tenant_peut_recevoir_pourboires(uuid)
  TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- G. Garde des commandes: le pourboire suit le plan.
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
  -- LE POURBOIRE SUIT LE PLAN (ajout du 2026-11-20, constat G).
  -- --------------------------------------------------------------------------
  -- Les pourboires sont Pro et plus (canAccessTips, src/lib/plans/features.ts).
  -- Les routes et `actionMarkOrderPaid` le verifiaient, mais un employe
  -- authentifie pouvait ecrire `tip_amount` directement par l'API sur une
  -- commande en attente, quel que soit le plan. La borne porte sur une HAUSSE
  -- seulement: remettre un pourboire plus bas (correction, annulation d'un
  -- encaissement par l'autorite argent) ne fait entrer aucun argent hors plan,
  -- et ne doit pas echouer parce que le plan a change entre temps. Elle
  -- s'applique a tous, autorite argent comprise: c'est le plan du restaurant
  -- qui est juge, pas le role.
  IF coalesce(NEW.tip_amount, 0) > coalesce(OLD.tip_amount, 0)
     AND NOT public.tenant_peut_recevoir_pourboires(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Les pourboires ne sont pas inclus dans votre plan'
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

-- Le declencheur trg_montants_commande_non_reecrits pointe deja sur cette
-- fonction (20261107210000): rien a recreer.

-- ----------------------------------------------------------------------------
-- G bis. Meme regle a la CREATION d'une commande.
-- ----------------------------------------------------------------------------
-- Fonction recopiee A L'IDENTIQUE depuis 20261107210000 (derniere definition),
-- avec un seul bloc ajoute, signale dans le corps. Le declencheur
-- trg_creation_commande_non_reglee pointe deja dessus.
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

  -- Ajout du 2026-11-20 (relecture du lot pourboires): le pourboire suit le
  -- plan des la CREATION aussi. Sans ce bloc, un caissier d'un restaurant
  -- Starter inserait par l'API une commande portant un pourboire. Place AVANT
  -- l'exemption de l'autorite argent: c'est le plan qui juge, pas le role.
  -- Aucun chemin applicatif n'est touche: la vitrine et la caisse creent les
  -- commandes avec le role service, que ce declencheur laisse passer.
  IF coalesce(NEW.tip_amount, 0) > 0
     AND NOT public.tenant_peut_recevoir_pourboires(NEW.tenant_id)
  THEN
    RAISE EXCEPTION
      'Les pourboires ne sont pas inclus dans votre plan'
      USING ERRCODE = '42501';
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

-- ----------------------------------------------------------------------------
-- C. Resume des commandes: pourboires sur la date d'encaissement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_summary(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(total_revenue numeric, total_orders bigint, avg_basket numeric, total_tax numeric, total_service_charge numeric, total_discounts numeric, total_tips numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_revenue NUMERIC;
  v_orders BIGINT;
  v_tips NUMERIC;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0),
         COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')
    INTO v_revenue, v_orders
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date;

  -- Pourboires ENCAISSES sur la periode: commandes reglees (ou reglees puis
  -- remboursees en partie, statut 'partial') dont l'encaissement tombe dans la
  -- periode. Un offert ('comp') et une annulation n'en ont pas.
  SELECT COALESCE(SUM(o.tip_amount), 0)
    INTO v_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.paid_at >= p_start_date AND o.paid_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');

  RETURN QUERY
  SELECT v_revenue::NUMERIC AS total_revenue,
    v_orders::BIGINT AS total_orders,
    CASE WHEN v_orders > 0 THEN ROUND(v_revenue / v_orders, 2) ELSE 0 END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    v_tips::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');
END;
$function$;

-- ----------------------------------------------------------------------------
-- D. Performance des serveurs: colonne `tips`.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.get_server_performance(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(server_id uuid, server_name text, orders bigint, revenue numeric, tips numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  WITH encaisse AS (
    SELECT
      o.server_id AS sid,
      COUNT(DISTINCT o.id) FILTER (WHERE p.status = 'completed')::BIGINT AS nb,
      SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::NUMERIC AS ca
    FROM payments p
    JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id
      AND p.created_at >= p_start_date
      AND p.created_at <= p_end_date
      AND o.server_id IS NOT NULL
    GROUP BY o.server_id
  ),
  pourboires AS (
    -- Meme regle que get_order_summary.total_tips.
    SELECT o.server_id AS sid, SUM(o.tip_amount)::NUMERIC AS pb
    FROM orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.paid_at >= p_start_date
      AND o.paid_at <= p_end_date
      AND o.server_id IS NOT NULL
      AND o.status != 'cancelled'
      AND o.payment_status IN ('paid', 'partial')
    GROUP BY o.server_id
  )
  -- FULL JOIN: un serveur dont le pourboire est encaisse dans la periode sans
  -- ligne au registre dans cette meme periode (bornes) garde son pourboire.
  SELECT
    COALESCE(e.sid, pb.sid) AS server_id,
    COALESCE(au.full_name, COALESCE(e.sid, pb.sid)::TEXT)::TEXT AS server_name,
    COALESCE(e.nb, 0)::BIGINT AS orders,
    COALESCE(e.ca, 0)::NUMERIC AS revenue,
    COALESCE(pb.pb, 0)::NUMERIC AS tips
  FROM encaisse e
  FULL JOIN pourboires pb ON pb.sid = e.sid
  LEFT JOIN admin_users au ON au.id = COALESCE(e.sid, pb.sid)
  ORDER BY COALESCE(e.nb, 0) DESC;
END;
$function$;

ALTER FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) OWNER TO postgres;
-- `anon` explicitement: les privileges par defaut de Supabase l'accordent a
-- toute fonction creee, et la production ne l'ouvre qu'a authenticated.
REVOKE ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

COMMIT;
