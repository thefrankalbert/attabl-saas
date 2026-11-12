-- Commandes "payees" sans aucune ligne au registre des paiements.
--
-- POURQUOI. Depuis 20261112140000, le chiffre d'affaires se lit dans le
-- registre `payments`. Mesure en production le 2026-11-12: 12 commandes au
-- statut 'paid' n'y ont aucune ligne (restaurant de test "blutable", avril a
-- juin 2026, avant que chaque encaissement passe par le registre). Sans
-- rattrapage, elles disparaitraient de l'historique du chiffre.
--
-- CE QUI EST ECRIT. Une ligne 'completed' par commande, pour total +
-- pourboire (la definition du chiffre), avec la methode de la commande
-- (especes par defaut: 11 des 12 le disent deja, la 12e n'en porte aucune),
-- datee du moment du paiement (paid_at, sinon la creation de la commande).
--
-- IDEMPOTENT: ne touche que les commandes 'paid' qui n'ont encore aucune
-- ligne. Rejouer la migration n'ecrit rien de plus.
--
-- Rollback (les lignes ecrites ici sont reconnaissables a created_by NULL et
-- a leur date anterieure au 2026-07-01):
--   DELETE FROM public.payments p
--   WHERE p.created_by IS NULL AND p.created_at < '2026-07-01'
--     AND p.order_id IN (<les 12 identifiants listes dans 04-REPRISE.md>);

INSERT INTO public.payments (tenant_id, order_id, amount, method, status, created_at)
SELECT o.tenant_id,
       o.id,
       (o.total + COALESCE(o.tip_amount, 0))::bigint,
       COALESCE(NULLIF(o.payment_method, ''), 'cash'),
       'completed',
       COALESCE(o.paid_at, o.created_at)
FROM public.orders o
WHERE o.payment_status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id);
