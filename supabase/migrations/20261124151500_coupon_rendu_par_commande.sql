-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B67 (contre-audit 2, bloquant). Le coupon
-- d'une commande annulee est rendu PAR LA BASE, a partir de la commande, une
-- seule fois, et seulement s'il appartient au meme restaurant.
--
-- CE QUI NE TENAIT PAS. Apres le contre-audit 1, l'action rendait en
-- service_role le `coupon_id` lu sur la commande annulee. Or `orders.coupon_id`
-- restait modifiable par un employe qui a `orders.pay` (colonne hors suivi de
-- cuisine, seule la garde `orders.pay` s'appliquait), et `unclaim_coupon_usage`
-- ne controle pas le restaurant pour service_role. Reproduit: un caissier de A
-- ecrit sur une commande impayee de A le coupon d'un restaurant B, annule, et
-- le compteur du coupon de B passe de 4 a 3.
--
-- LA CORRECTION.
-- 1. Colonne `orders.coupon_rendu_at timestamptz` (NULL = pas encore rendu).
--    Choix: une colonne horodatee plutot que remettre `coupon_id` a NULL, qui
--    effacerait le lien commande/coupon (remise, historique, rapports par
--    coupon via `coupon_redemptions.order_id` et `orders.coupon_id`).
-- 2. `rendre_coupon_commande(p_order_id, p_tenant_id) RETURNS boolean`,
--    SECURITY INVOKER, EXECUTE a service_role seulement. Elle VERROUILLE la
--    commande (`FOR UPDATE`), et ne rend que si: la commande existe pour ce
--    restaurant, est `cancelled`, porte un coupon, ne l'a pas deja rendu, et le
--    coupon appartient au MEME restaurant. Elle decremente (plancher 0) et pose
--    `coupon_rendu_at` dans la meme transaction. Rejouer l'appel ne rend rien
--    une seconde fois (deux appels simultanes: le second attend le verrou puis
--    voit la marque).
-- 3. `refuser_reecriture_montants_commande` (fonction du lot B150, accord de
--    l'orchestrateur pour ce point precis): ajout d'un seul bloc qui refuse a
--    `authenticated`/`anon` toute modification de `coupon_id` et de
--    `coupon_rendu_at` apres la creation, a cote des montants qu'elle protege
--    deja (meme famille: la remise). Seule autre retouche: un commentaire de
--    son en-tete attribuait la regle de l'offert a la politique UPDATE, alors
--    que depuis 20261124150000 c'est le declencheur
--    `refuser_argent_sans_orders_pay` qui la porte. Corps recopie du texte
--    STOCKE en production (`lot-b2b1/prod-fonctions.sql`), rien d'autre.
-- 4. Reprise BORNEE par un instant ecrit en dur ('2026-11-24 02:00:00+00'):
--    seules les commandes annulees avec coupon dont `updated_at` est anterieur
--    sont marquees rendues (l'ancien code rendait le coupon AVANT d'annuler,
--    en session). Le litteral rend la reprise neutre au rejeu: une annulation
--    posterieure n'est jamais marquee, et une ligne deja marquee est exclue.
--    Elle reecrit `updated_at` (declencheur `update_orders_updated_at`, qui
--    pose `now()` sans condition) et emet un evenement temps reel par ligne:
--    impossible a eviter sans desactiver un declencheur, ce qu'on ne fait pas.
--    En production le 2026-11-24 01:47 UTC: 0 commande avec coupon, donc 0
--    ligne touchee.
--
-- CE QUI EST GARANTI. Par les chemins de l'application, un coupon n'est
-- jamais rendu deux fois pour une meme commande, ni pour une commande non
-- annulee, ni pour un coupon d'un autre restaurant. Annulation (session) et
-- rendu (service_role) sont deux transactions: un rendu qui echoue est
-- rejouable sans risque (nouvelle demande d'annulation, ou
-- `select rendre_coupon_commande(<commande>, <restaurant>)` en service_role).
--
-- ORDRE DE DEPLOIEMENT: AVANT le code en ligne (puis le code, puis
-- 20261124151000). Sans risque pour le code actuellement servi (origin/main),
-- verifie le 2026-11-24:
-- - il n'appelle pas `rendre_coupon_commande`;
-- - il n'ecrit jamais `coupon_rendu_at`;
-- - il n'ecrit `coupon_id` qu'a la creation, en service_role
--   (`create_order_with_items`), que la garde ne juge pas. Toutes les mises a
--   jour de `orders` par un client de session ont ete relues: `cancelOrder`
--   ({status}), `updateStatus` ({status, served_at}), `revertPaidFlip`
--   (montants de paiement), `assignment.service` ({server_id}),
--   `order-annotation.service` ({house_account_id}), `payment.service`
--   compOrder (colonnes de l'offert), `payment.queries` recompute
--   ({payment_status, paid_at, payment_method}). Aucune n'envoie `coupon_id`,
--   meme inchange; et la garde compare OLD et NEW (`IS DISTINCT FROM`), donc
--   une valeur renvoyee identique ne serait de toute facon pas refusee.
--   `retention.service` et `apply-pos-payment` ecrivent en service_role.
-- RISQUE RESIDUEL: une commande avec coupon annulee par l'ANCIEN code apres
-- l'instant en dur et avant la promotion du nouveau code a deja eu son coupon
-- rendu, mais n'est pas marquee. Elle ne serait rendue une seconde fois que si
-- quelqu'un redemandait son annulation sous le nouveau code (l'ecran ne le
-- propose pas sur une commande annulee). Controle apres la promotion: voir le
-- rapport du correcteur (requete fournie).
--
-- ROLLBACK: rejouer `refuser_reecriture_montants_commande` de
-- prod-fonctions.sql, puis
--   DROP FUNCTION IF EXISTS public.rendre_coupon_commande(uuid, uuid);
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS coupon_rendu_at;
-- ============================================================================

-- Pas de BEGIN/COMMIT explicites: l'outil d'application enveloppe deja
-- chaque migration dans une transaction, et le test pgTAP rejoue ce fichier
-- (`\ir`) dans la sienne pour prouver la borne de la reprise.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_rendu_at timestamptz;

COMMENT ON COLUMN public.orders.coupon_rendu_at IS
  'Quand le coupon de cette commande annulee a ete rendu (rendre_coupon_commande). NULL = pas rendu.';

CREATE OR REPLACE FUNCTION public.refuser_reecriture_montants_commande()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Ordre de REGLEMENT, pour distinguer un progres d'un retour en arriere.
  -- `comp` et `refunded` sont au-dela: ce sont des etats terminaux, et le
  -- declencheur `refuser_argent_sans_orders_pay` (20261124150000) exige
  -- l'autorite argent pour rendre une commande offerte ou remboursee.
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

  -- Contre-audit 2 du lot B2b-1 (B67): le coupon d'une commande et la trace de
  -- son rendu ne se reecrivent pas apres la creation. Le coupon est rendu par
  -- `rendre_coupon_commande` (service_role) a partir de CETTE colonne: un
  -- employe qui la reecrivait faisait rendre un coupon de son choix, y compris
  -- d'un autre restaurant.
  IF NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
     OR NEW.coupon_rendu_at IS DISTINCT FROM OLD.coupon_rendu_at
  THEN
    RAISE EXCEPTION
      'Le coupon d''une commande ne se reecrit pas apres sa creation'
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

  -- Et il ne BAISSE pas, quel que soit le statut (20261124100100, constat B150,
  -- contre-audit 1). La borne ci-dessus laissait reecrire le pourboire d'une
  -- commande encore 'pending' dans les DEUX sens: un caissier effacait le
  -- pourboire laisse par le client dans la meme requete que la bascule a
  -- 'paid', avec un registre qui couvrait le total sans le pourboire. Le
  -- controle "le registre couvre le du" (20261124100000) lit le pourboire
  -- courant, donc celui que le caissier venait de baisser: l'ecart
  -- disparaissait. Mesure: aucun chemin applicatif ne baisse le pourboire sous
  -- le jeton d'un employe. `encaisser_commande` refuse un ajout negatif et ne
  -- fait qu'ajouter; la route POS tourne en service_role; il n'existe aucun
  -- ecran de correction du pourboire. Une correction reste possible par
  -- l'autorite sur l'argent (owner, admin, manager).
  IF coalesce(NEW.tip_amount, 0) < coalesce(OLD.tip_amount, 0)
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le pourboire laisse par le client ne se baisse pas sans l''autorite argent'
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
  --
  -- EXCEPTION (20261121200400): le PREMIER enregistrement du moyen, quand une
  -- commande payee en plusieurs fois devient soldee. `recompute` ecrit alors,
  -- dans le meme UPDATE, `payment_status` de 'partial' a 'paid' et le moyen
  -- dominant du registre, jusque-la NULL. Sans cette exception, un caissier
  -- ne pouvait jamais terminer un encaissement en plusieurs fois. Rien n'est
  -- reetiquete: le moyen etait vide, et la commande ne peut pas rester
  -- 'partial' avec un moyen pose (la bascule a 'paid' est exigee).
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
     AND coalesce(OLD.payment_status, '') <> 'pending'
     AND NOT (OLD.payment_method IS NULL
              AND coalesce(OLD.payment_status, '') = 'partial'
              AND NEW.payment_status = 'paid'
              -- Et seulement si le REGISTRE couvre le du: meme regle que
              -- `recompute` (payment.calc.ts: du = total + pourboire, net =
              -- encaisse - rembourse, solde si net > 0 et net >= du). Sans
              -- cela, un caissier passait par l'API une commande a 400 sur
              -- 1000 en 'paid' avec un moyen. Lecture sous les droits de
              -- l'appelant (SECURITY INVOKER): la politique SELECT de
              -- `payments` ouvre au membre les paiements de son restaurant.
              AND (SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                                            ELSE p.amount END), 0)
                     FROM public.payments p
                    WHERE p.order_id = OLD.id
                      AND p.tenant_id = OLD.tenant_id)
                  >= greatest(coalesce(NEW.total, 0) + coalesce(NEW.tip_amount, 0), 1))
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
$function$;

CREATE OR REPLACE FUNCTION public.rendre_coupon_commande(p_order_id uuid, p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_coupon uuid;
  v_status text;
  v_rendu timestamptz;
BEGIN
  SELECT o.coupon_id, o.status, o.coupon_rendu_at
    INTO v_coupon, v_status, v_rendu
    FROM public.orders o
   WHERE o.id = p_order_id AND o.tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'cancelled'
     OR v_coupon IS NULL OR v_rendu IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Le coupon doit etre celui du MEME restaurant.
  UPDATE public.coupons c
     SET current_uses = GREATEST(c.current_uses - 1, 0), updated_at = now()
   WHERE c.id = v_coupon AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.orders SET coupon_rendu_at = now()
   WHERE id = p_order_id AND tenant_id = p_tenant_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.rendre_coupon_commande(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rendre_coupon_commande(uuid, uuid) TO service_role;

-- Reprise BORNEE (voir l'en-tete, point 4).
UPDATE public.orders
   SET coupon_rendu_at = updated_at
 WHERE status = 'cancelled'
   AND coupon_id IS NOT NULL
   AND coupon_rendu_at IS NULL
   AND updated_at < '2026-11-24 02:00:00+00'::timestamptz;

