-- Lot desabonnement: adresses qui ne veulent plus recevoir les relances
-- commerciales d'ATTABL.
--
-- AVANT: aucun e-mail d'ATTABL n'avait de lien de desabonnement. Les relances
-- commerciales (inactivite pendant l'essai, fin d'essai, premiere et dixieme
-- commande) partaient a toute adresse de proprietaire, sans moyen de les
-- arreter. La tache quotidienne `trial-idle-emails` (lot B2b-3b) les envoie
-- maintenant sans visite humaine.
--
-- APRES: une table, une ligne par adresse desabonnee. Chaque relance
-- commerciale lit cette table AVANT d'envoyer et AVANT de reserver son creneau
-- (`claim_activation_event`): une adresse desabonnee ne recoit rien et ne
-- consomme pas sa relance. Les e-mails transactionnels (mot de passe,
-- invitation, alerte de stock, rappel de paiement...) ne lisent jamais cette
-- table.
--
-- POURQUOI PAR ADRESSE ET PAS PAR RESTAURANT: un proprietaire peut avoir
-- plusieurs restaurants. Il se desabonne une fois, pour toutes les relances
-- envoyees a cette adresse. C'est la seule table du lot, et elle n'a donc pas
-- de `tenant_id`: elle ne contient aucune donnee d'un restaurant.
--
-- ACCES: RLS active SANS AUCUNE policy, et aucun droit pour `anon` ni
-- `authenticated`. Personne n'y accede par l'API publique. Seul le serveur la
-- touche, avec la cle service_role:
--   - la route `/api/email/unsubscribe` ecrit (la personne qui se desabonne
--     n'est pas connectee; l'adresse vient d'un jeton chiffre et authentifie
--     par le serveur, jamais d'un parametre libre);
--   - les envois de relance lisent.
-- Aucun ecran connecte n'en a besoin (pas de centre de preferences demande).
--
-- Migration additive: a appliquer AVANT le deploiement du code, qui lit la
-- table a chaque relance (sans elle, la lecture echoue et aucune relance ne
-- part, ce qui est sur mais muet).
--
-- Rollback: drop table if exists public.email_unsubscribes;

create table if not exists public.email_unsubscribes (
  -- Adresse en minuscules, sans espaces autour: la comparaison ignore la casse
  -- et les espaces parce que l'application normalise TOUJOURS avant d'ecrire
  -- et avant de lire. La contrainte refuse une ecriture non normalisee, qui
  -- ne serait jamais retrouvee par une lecture normalisee.
  email_normalized text primary key
    constraint email_unsubscribes_normalized_check
      check (
        email_normalized = lower(btrim(email_normalized))
        and char_length(email_normalized) between 3 and 320
        and position('@' in email_normalized) > 1
      ),
  unsubscribed_at timestamptz not null default now()
);

comment on table public.email_unsubscribes is
  'Adresses desabonnees des relances commerciales (inactivite, fin d essai, premiere et dixieme commande). Ecrite par la route /api/email/unsubscribe (service_role, adresse issue d un jeton verifie), lue avant chaque relance. Jamais lue par un e-mail transactionnel. Aucun acces anon/authenticated.';

-- La cle primaire porte l'index unique sur l'adresse normalisee: c'est la
-- seule colonne de recherche (une adresse, ou une liste d'adresses avec `in`).

alter table public.email_unsubscribes enable row level security;

-- Droits explicites: aucun pour les roles clients, le strict necessaire pour
-- service_role (qui contourne RLS mais pas les privileges de table).
-- service_role est AUSSI dans le revoke: les privileges par defaut de Supabase
-- lui donnent tout (y compris update, truncate) sur chaque table creee par
-- `postgres`, mesure en production dans `pg_default_acl` (contre-audit 1, D1).
-- Sans lui ici, le grant ci-dessous n'aurait rien restreint.
revoke all on table public.email_unsubscribes from public, anon, authenticated, service_role;
grant select, insert, delete on table public.email_unsubscribes to service_role;
