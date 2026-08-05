-- public.zones: policy SELECT "Public can view zones" en USING (true).
--
-- Constat ABSENT de l'audit pre-pilote. Trouve le 2026-08-05 en interrogeant la
-- base de PRODUCTION (et non en relisant le code): les audits precedents ont ete
-- menes sur le depot, cette policy n'apparait dans aucune migration du repo.
--
-- Etat mesure en production le 2026-08-05:
--   policies zones : "Admins can manage zones" [ALL] | "Public can view zones" [SELECT]
--   grants anon    : SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
--   lignes         : 7
--
-- Consequence: avec la seule cle anon (publique, presente dans chaque bundle
-- navigateur), un visiteur lit les espaces de TOUS les restaurants - noms,
-- prefixes de table, descriptions. Fuite de faible sensibilite mais reelle, et
-- de meme nature que DB-07 (ads).
--
-- Verifie AVANT ecriture, comme pour ads: `zones` n'est lu par AUCUNE surface
-- storefront anonyme. Les seules lectures sont authentifiees:
--   services/qr-design.service.ts, table-config.service.ts, table-config.guards.ts,
--   service-manager.service.ts, lib/cache.ts, hooks/usePOSData.ts,
--   admin/settings/espaces/page.tsx, admin/settings/tables/page.tsx
-- On peut donc REMPLACER la lecture publique par une lecture scopee au tenant
-- sans rien casser cote convive.
--
-- La policy "Admins can manage zones" est en cmd=ALL: elle couvre deja SELECT
-- pour les membres du tenant. On ajoute malgre tout une policy SELECT explicite
-- plutot que de compter dessus - si un jour ALL est restreinte a INSERT/UPDATE,
-- la lecture admin ne doit pas tomber en silence.
--
-- Rollback:
--   drop policy "Members can view own tenant zones" on public.zones;
--   create policy "Public can view zones" on public.zones for select using (true);
--   grant select on table public.zones to anon;

drop policy if exists "Public can view zones" on public.zones;

create policy "Members can view own tenant zones"
  on public.zones
  for select
  to authenticated
  using (tenant_id = any (public.get_my_tenant_ids_array()));

-- anon n'a aucun besoin de lire les zones: aucune surface publique ne les rend.
revoke all on table public.zones from anon;
