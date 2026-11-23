-- ============================================================================
-- Une ardoise soldee ne recoit plus de commande (revue L007, A4).
-- ============================================================================
--
-- LE DEFAUT. attachOrderToHouseAccount verifiait que l'ardoise appartient au
-- restaurant, pas qu'elle est encore ouverte. Une commande posee sur une
-- ardoise soldee (liste perimee a l'ecran, ou attache pendant que `settle()`
-- encaisse puis ferme) n'etait plus jamais encaissee: `settle()` sort tout de
-- suite sur une ardoise soldee, et rien ne rouvre une ardoise. L'ecran
-- affichait "Soldee" avec un reste du.
--
-- LE CORRECTIF (l'application refuse deja avant, CONFLICT). Deux declencheurs
-- qui ferment la course entre l'attache et le solde:
--   1. sur `orders` : poser `house_account_id` exige une ardoise ouverte du
--      MEME restaurant. La lecture prend `FOR SHARE` sur l'ardoise: si un solde
--      est en cours (verrou de ligne pose par son UPDATE), l'attache attend sa
--      fin et voit alors 'settled'.
--   2. sur `house_accounts` : passer a 'settled' est refuse s'il reste sur
--      l'ardoise une commande qui doit REELLEMENT de l'argent. Meme calcul que
--      get_house_account_balances: commande non annulee, ni 'paid' ni 'comp',
--      et (total + pourboire) - net du registre > 0. Une commande a 0 (prix 0
--      permis) ne bloque donc pas le solde; une commande 'refunded' dont le
--      reste est positif le bloque, comme dans les soldes affiches et dans
--      settle() (CONFLICT explicite). Une attache validee juste avant le solde
--      est vue par le solde, qui echoue au lieu de fermer une ardoise qui doit
--      encore de l'argent.
--
-- SECURITY DEFINER: les fonctions lisent `house_accounts` et `orders` sans
-- dependre des politiques RLS de l'appelant (le `FOR SHARE` exigerait sinon un
-- droit UPDATE que le caissier n'a pas). Elles ne lisent que la ligne visee par
-- NEW et n'utilisent pas `current_user`. EXECUTE est retire a PUBLIC, anon et
-- authenticated; service_role le garde (droits par defaut de Supabase), sans
-- effet: une fonction de declencheur ne s'appelle pas directement.
--
-- 3. get_house_account_balances (soldes affiches): meme regle que la garde
--    pour un `payment_status` NULL (colonne nullable, defaut 'pending'). Avec
--    `payment_status NOT IN (...)`, un NULL donnait NULL, donc une commande
--    exclue: l'ardoise affichait 0 du alors que la garde refusait de la solder.
--    Un NULL vaut desormais 'pending' dans les trois regles (garde, soldes,
--    settle()). Mesure en production par l'orchestrateur le 2026-11-23: 0 ligne
--    NULL sur 745; aucune contrainte NOT NULL n'est posee dans ce lot. Corps
--    repris du corps stocke (supabase/schema.sql, cree par 20260703200000,
--    inchange depuis): seules les deux expressions `payment_status` changent.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_orders_house_account_open ON public.orders;
--   DROP TRIGGER IF EXISTS trg_house_accounts_settle_guard ON public.house_accounts;
--   DROP FUNCTION IF EXISTS public.guard_order_house_account_open();
--   DROP FUNCTION IF EXISTS public.guard_house_account_settle();
--   et rejouer get_house_account_balances telle que supabase/schema.sql la
--   definit (`o.payment_status NOT IN ('paid','comp')`, deux fois).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_order_house_account_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_tenant uuid;
BEGIN
  IF NEW.house_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.house_account_id IS NOT DISTINCT FROM OLD.house_account_id THEN
    RETURN NEW;
  END IF;

  SELECT ha.status, ha.tenant_id
    INTO v_status, v_tenant
    FROM public.house_accounts ha
   WHERE ha.id = NEW.house_account_id
     FOR SHARE;

  IF NOT FOUND OR v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Ardoise introuvable'
      USING ERRCODE = '23503', HINT = 'house_account_tenant';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette ardoise est deja soldee'
      USING ERRCODE = '23514', HINT = 'house_account_settled';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_order_house_account_open() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_house_account_open ON public.orders;
CREATE TRIGGER trg_orders_house_account_open
  BEFORE INSERT OR UPDATE OF house_account_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_house_account_open();

CREATE OR REPLACE FUNCTION public.guard_house_account_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'settled'
     AND OLD.status IS DISTINCT FROM 'settled'
     AND EXISTS (
       SELECT 1
         FROM public.orders o
        WHERE o.house_account_id = NEW.id
          AND o.tenant_id = NEW.tenant_id
          AND coalesce(o.status, '') <> 'cancelled'
          AND coalesce(o.payment_status, 'pending') NOT IN ('paid', 'comp')
          AND (coalesce(o.total, 0) + coalesce(o.tip_amount, 0))
              - coalesce((
                  SELECT sum(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)
                    FROM public.payments p
                   WHERE p.order_id = o.id
                ), 0) > 0
     ) THEN
    RAISE EXCEPTION 'Une commande de cette ardoise reste a encaisser'
      USING ERRCODE = '23514', HINT = 'house_account_unsettled_orders';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_house_account_settle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_house_accounts_settle_guard ON public.house_accounts;
CREATE TRIGGER trg_house_accounts_settle_guard
  BEFORE UPDATE OF status ON public.house_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_house_account_settle();

CREATE OR REPLACE FUNCTION public.get_house_account_balances(p_tenant_id uuid)
RETURNS TABLE(account_id uuid, name text, status text, open_orders bigint, outstanding bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT ha.id, ha.name, ha.status,
    COUNT(o.id) FILTER (
      WHERE coalesce(o.payment_status, 'pending') NOT IN ('paid','comp') AND o.status <> 'cancelled'
    )::bigint AS open_orders,
    COALESCE(SUM(
      CASE WHEN coalesce(o.payment_status, 'pending') NOT IN ('paid','comp') AND o.status <> 'cancelled'
        THEN (o.total + COALESCE(o.tip_amount,0))
             - COALESCE((SELECT SUM(CASE WHEN p.status='refunded' THEN -p.amount ELSE p.amount END)
                         FROM payments p WHERE p.order_id = o.id), 0)
        ELSE 0 END), 0)::bigint AS outstanding
  FROM house_accounts ha
  LEFT JOIN orders o ON o.house_account_id = ha.id AND o.tenant_id = ha.tenant_id
  WHERE ha.tenant_id = p_tenant_id
  GROUP BY ha.id, ha.name, ha.status, ha.created_at
  ORDER BY ha.created_at DESC;
END; $$;
