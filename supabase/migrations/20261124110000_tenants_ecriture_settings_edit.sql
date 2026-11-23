-- ============================================================================
-- Audit B103 (Haute): la politique d'ecriture de `tenants` exige enfin le droit
-- `settings.edit`, comme l'application.
--
-- CE QUI NE TENAIT PAS. `20261107120000_rls_roles_ecritures_argent.sql` a pose
-- la politique "Settings managers can update own tenant" avec
-- `has_tenant_write_permission(id, NULL)`. Avec une permission NULLE, le corps
-- stocke de la fonction (`20261109200000`, identique en production) tombe dans
-- la branche par defaut: owner, admin ET manager passent, et la delegation
-- `custom_permissions` / `role_permissions` n'est jamais lue. Consequences
-- mesurees (essai L128, base locale):
--   - un GERANT, a qui l'application refuse les reglages (`settings.edit` vaut
--     false pour `manager` dans DEFAULT_PERMISSIONS), modifiait par appel direct
--     a PostgREST la TVA, la devise, les frais de service et le nom;
--   - un administrateur a qui le proprietaire a RETIRE `settings.edit` aussi;
--   - un caissier a qui le proprietaire a ACCORDE `settings.edit` ne pouvait
--     rien enregistrer, et l'application lui disait "enregistre".
--
-- LA CORRECTION. La politique passe `'settings.edit'` a la meme fonction. Dans
-- le corps stocke, une permission `'settings.edit'` donne exactement la regle
-- de l'application (`getAuthenticatedUserWithTenant('settings.edit')`):
--   - proprietaire: toujours (branche `au.role = 'owner'`);
--   - surcharge individuelle `custom_permissions`, puis surcharge de role
--     `role_permissions`: elles tranchent, dans les deux sens;
--   - sans surcharge: `admin` seulement (matrice par defaut);
--   - membre desactive ou supprime: jamais.
-- Le super administrateur n'est pas concerne: il n'ecrit `tenants` qu'avec le
-- client service_role (platform-admin.service.ts), hors RLS, avant comme apres.
--
-- PARCOURS VERIFIES (toutes les ecritures de `tenants` faites avec une session
-- utilisateur dans src/, recherche exhaustive le 2026-11-24):
--   - reglages (nom, couleurs, logo, sons, facturation, TVA, devise, horaires,
--     ecran de veille, KDS): actions/tenant-settings.ts, garde `settings.edit`;
--   - moyens de paiement: actions/payment-methods.ts, garde `settings.edit`;
--   - onboarding (sauvegarde et fin): api/onboarding/save et complete,
--     reserves au PROPRIETAIRE (ONBOARDING_COMPLETE_ROLES = ['owner']).
-- Toutes les autres ecritures (webhooks Stripe, crons, fermeture de compte,
-- super administrateur, `last_active_at` du layout) passent par service_role.
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne. L'application
-- n'ecrit deja `tenants` qu'avec `settings.edit` ou en proprietaire: rien de ce
-- qu'elle fait n'est retire.
--
-- ROLLBACK (deconseille, rouvre le defaut):
--   DROP POLICY IF EXISTS "Settings managers can update own tenant" ON public.tenants;
--   CREATE POLICY "Settings managers can update own tenant" ON public.tenants
--     FOR UPDATE USING (public.has_tenant_write_permission(tenants.id, NULL))
--     WITH CHECK (public.has_tenant_write_permission(tenants.id, NULL));
-- ============================================================================

DROP POLICY IF EXISTS "Settings managers can update own tenant" ON public.tenants;

CREATE POLICY "Settings managers can update own tenant"
  ON public.tenants
  FOR UPDATE
  USING (public.has_tenant_write_permission(tenants.id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(tenants.id, 'settings.edit'));
