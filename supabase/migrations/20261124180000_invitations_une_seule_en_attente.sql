-- B53 (revue ligne par ligne, lot B2b-3b): une seule invitation EN ATTENTE par
-- restaurant et par adresse.
--
-- Le service lisait "y a-t-il deja une invitation pending ?" puis inserait, sans
-- verrou: deux envois simultanes passaient tous deux la lecture. Ensuite
-- `maybeSingle()` sur deux lignes rendait une erreur qui n'etait pas lue, et
-- tous les doublons suivants passaient aussi.
--
-- L'index unique partiel est le verrou; le code traduit sa violation (23505)
-- en refus "une invitation est deja en attente". `lower(email)`: le schema Zod
-- met deja l'adresse en minuscules, l'index tient meme si un autre chemin ne
-- le fait pas.
--
-- Lecture de production (2026-11-24, lecture seule): 0 doublon pending
-- (exact ou insensible a la casse), 0 invitation pending, 0 adresse en
-- majuscules. L'index se cree donc sans heurter de ligne existante.
--
-- ORDRE: AVANT le code (additif; le code ancien continue de fonctionner, il
-- recoit seulement un 23505 au lieu d'un doublon).
--
-- Retour arriere: DROP INDEX IF EXISTS public.invitations_pending_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email_unique
  ON public.invitations (tenant_id, lower(email))
  WHERE status = 'pending';
