-- BATTEMENT DES TACHES PLANIFIEES + REGLAGES DE LA PLATEFORME (2026-11-15).
--
-- 1. cron_heartbeats: chaque passage d'une tache planifiee (rappels, gel des
--    essais expires, rapprochement des paiements) y note son heure et son
--    resultat. La console de la plateforme l'affiche et signale une tache qui
--    ne passe plus. C'est la preuve qu'une tache tourne: les journaux Vercel
--    restent vides quand tout va bien, et les moniteurs Sentry n'apparaissent
--    pas sur ce compte.
--    Ecriture et lecture: service_role seulement (la tache et la console).
--
-- 2. platform_settings: le numero du support (WhatsApp et appel), modifiable
--    depuis la console sans redeployer. Lecture: tout membre connecte (la page
--    d'aide du restaurant l'affiche). Ecriture: super administrateur seulement
--    (la console passe par service_role apres requireSuperAdmin; la policy
--    est le filet si un client authentifie tentait d'ecrire directement).
--
-- Purement additive. Retour arriere: drop table public.cron_heartbeats;
-- drop table public.platform_settings;

create table if not exists public.cron_heartbeats (
  job text primary key,
  schedule text not null,
  last_run_at timestamptz not null,
  last_status text not null check (last_status in ('ok', 'error')),
  last_duration_ms integer not null check (last_duration_ms >= 0)
);

alter table public.cron_heartbeats enable row level security;
revoke all on table public.cron_heartbeats from anon, authenticated;
-- Aucune policy: anon et authenticated n'ont ni droit ni ligne visible.

create table if not exists public.platform_settings (
  key text primary key check (key in ('support_contact')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index if not exists idx_platform_settings_updated_by
  on public.platform_settings (updated_by);

alter table public.platform_settings enable row level security;
revoke all on table public.platform_settings from anon, authenticated;
grant select, insert, update, delete on table public.platform_settings to authenticated;

drop policy if exists "Membres connectes: lecture des reglages plateforme" on public.platform_settings;
create policy "Membres connectes: lecture des reglages plateforme"
  on public.platform_settings for select to authenticated
  using (true);

drop policy if exists "Super admin: ajout des reglages plateforme" on public.platform_settings;
create policy "Super admin: ajout des reglages plateforme"
  on public.platform_settings for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists "Super admin: modification des reglages plateforme" on public.platform_settings;
create policy "Super admin: modification des reglages plateforme"
  on public.platform_settings for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "Super admin: suppression des reglages plateforme" on public.platform_settings;
create policy "Super admin: suppression des reglages plateforme"
  on public.platform_settings for delete to authenticated
  using ((select public.is_super_admin()));
