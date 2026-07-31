-- DB-06 - public.coupons: toutes les campagnes promo de tous les tenants sont
-- enumerables par un anonyme.
--
-- Verifie en production le 2026-07-31: GET /rest/v1/coupons?select=code,discount_value
-- avec la cle anon renvoie 200 et 1 ligne. La table expose code, discount_type,
-- discount_value, max_discount_amount, min_order_amount, max_uses et current_uses.
--
-- Cause: policy "Public can validate active coupons" sans clause TO (donc role
-- public, anon inclus) + grants table pour anon.
--
-- Verifie avant ecriture: aucun chemin client ne lit coupons avec la cle anon.
--   - src/app/api/coupons/validate/route.ts resout le tenant par la RPC
--     get_tenant_by_slug puis valide cote serveur;
--   - src/services/coupon.service.ts tourne cote serveur;
--   - src/app/sites/[site]/admin/coupons/page.tsx est une surface admin
--     (role authenticated), couverte par "Admins can manage own tenant coupons".
--
-- Rollback:
--   grant select on table public.coupons to anon;
--   create policy "Public can validate active coupons" on public.coupons
--     for select using (is_active = true);

drop policy if exists "Public can validate active coupons" on public.coupons;

revoke all on table public.coupons from anon;
