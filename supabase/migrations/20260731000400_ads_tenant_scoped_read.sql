-- DB-07 - public.ads: policy SELECT "Anyone can view active ads" en USING (true).
--
-- Le jumeau announcements a recu ce traitement dans
-- 20260702000000 (drop de "Anyone can view active announcements", dont le qual
-- true exposait aussi les lignes INACTIVES). ads a ete oublie.
--
-- Difference importante avec announcements, verifiee le 2026-07-31 sur le schema
-- reel: ads n'a AUCUNE autre policy SELECT (les autres sont INSERT, UPDATE et
-- DELETE). Un simple drop couperait donc la lecture aux admins sur leur propre
-- page /admin/ads. On REMPLACE la policy au lieu de la supprimer.
--
-- Verifie avant ecriture: ads n'est rendu nulle part dans le storefront. Les
-- seules lectures sont src/app/sites/[site]/admin/ads/page.tsx et
-- src/services/ad.service.ts, toutes deux sur des surfaces authentifiees.
--
-- Table vide en production aujourd'hui (0 ligne).
--
-- Rollback:
--   drop policy "Admins can view own tenant ads" on public.ads;
--   create policy "Anyone can view active ads" on public.ads for select using (true);
--   grant select on table public.ads to anon;

drop policy if exists "Anyone can view active ads" on public.ads;

create policy "Admins can view own tenant ads"
  on public.ads
  for select
  to authenticated
  using (tenant_id = any (public.get_my_tenant_ids_array()));

revoke all on table public.ads from anon;
