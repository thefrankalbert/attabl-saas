-- Details propres au type d'etablissement (etoiles d'un hotel, terrasse d'un
-- bar, wifi d'un cafe, caisses et livraison d'un fast-food, capacite d'un
-- restaurant).
--
-- POURQUOI. L'onboarding pose ces questions, puis les jetait: aucune colonne
-- ne les recevait et le schema de validation de fin d'onboarding les retirait.
-- Le restaurateur devait les ressaisir... sauf qu'aucun ecran ne les proposait.
--
-- POURQUOI UN SEUL JSONB ET PAS SEPT COLONNES. Ces attributs dependent du type
-- (un hotel n'a pas de caisses, un bar n'a pas d'etoiles): sept colonnes
-- seraient nulles a 80 %. La forme est validee cote application par
-- `establishmentDetailsSchema` (src/lib/validations/establishment-details.schema.ts)
-- a chaque ecriture; la base garantit seulement que c'est un objet.
--
-- ADDITIVE: aucun acces retire, aucune donnee modifiee. Le defaut '{}' rend la
-- colonne immediatement lisible par le code qui l'attend.
--
-- Rollback:
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS establishment_details;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS establishment_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_establishment_details_is_object;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_establishment_details_is_object
  CHECK (jsonb_typeof(establishment_details) = 'object');

-- `authenticated` n'a sur `tenants` que des droits UPDATE colonne par colonne
-- (20260420000002_restrict_tenant_billing_updates). Sans ce GRANT, l'ecriture
-- depuis les parametres et la fin d'onboarding echoue en `permission denied`.
-- Pas de SELECT pour `anon`: ces details ne servent qu'a l'espace de gestion.
GRANT UPDATE (establishment_details) ON public.tenants TO authenticated;
