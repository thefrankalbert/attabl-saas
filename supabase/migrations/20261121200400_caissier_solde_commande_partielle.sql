-- ============================================================================
-- Un caissier peut terminer un encaissement en plusieurs fois
-- (cinquieme contre-audit du lot A, constat L132).
-- ============================================================================
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT ou APRES le code. Elle REPARE AUSSI
-- LA PRODUCTION ACTUELLE: le chemin de la fiche (actionRecordTender) est deja
-- casse pour un caissier, independamment du lot A.
--
-- LE DEFAUT. Quand le second versement solde une commande 'partial',
-- `recompute` (src/services/payment.queries.ts, jeton de l'employe) ecrit
-- `payment_status = 'paid'` ET `payment_method`, qui etait NULL. La garde du
-- moyen de paiement de `refuser_reecriture_montants_commande` refuse tout
-- changement du moyen sur une commande qui n'est plus 'pending', a qui n'a pas
-- l'autorite sur l'argent (owner, admin, manager): erreur 42501. Le versement
-- restait au registre, la commande restait 'partial' pour toujours et la table
-- restait occupee. Prouve en base avec un vrai role caissier.
--
-- LE CORRECTIF. Une seule clause change: la garde du moyen de paiement laisse
-- passer le cas ou le moyen etait NULL, ou la commande passe de 'partial' a
-- 'paid' dans le meme UPDATE, ET ou le registre couvre le du (meme regle de
-- "solde" que `recompute`). Restent refuses (pgTAP revue_lot_a): reetiqueter
-- une commande payee, poser un moyen sur une commande encore 'partial' sans la
-- solder, changer le moyen d'une commande 'partial' qui en a deja un, passer
-- 'paid' avec un moyen une commande dont le registre ne couvre pas le du. Les
-- autres gardes (restaurant, montants, dereglement, pourboire, horodatages,
-- date de creation) sont inchangees.
--
-- SOURCE. Corps repris du texte EXACT stocke en production (extrait par
-- l'orchestrateur le 2026-11-23), identique ligne a ligne au corps de
-- 20261107210000 (seule definition du depot). Meme signature, SECURITY
-- INVOKER (la garde lit `current_user`: elle DOIT rester INVOKER), meme
-- search_path. CREATE OR REPLACE garde le proprietaire, les droits EXECUTE
-- (PUBLIC, anon, authenticated, service_role) et le declencheur
-- trg_montants_commande_non_reecrits, qui reste attache.
--
-- Rollback: rejouer le CREATE OR REPLACE FUNCTION de
-- 20261107210000_matrice_defaut_et_montants_proteges.sql (section 2).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refuser_reecriture_montants_commande()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
