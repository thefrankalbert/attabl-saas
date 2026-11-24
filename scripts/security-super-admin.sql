-- =====================================================
-- SCRIPTS DE SÉCURITÉ SUPER ADMIN - ATTABL
-- Exécuter AVANT la mise en production
-- =====================================================

-- ==========================================
-- OPTION 1: DÉSACTIVER LE SUPER ADMIN
-- ==========================================
-- Retire tous les privilèges Super Admin
-- ATTENTION (B153): cet UPDATE etait actif. Executer le fichier entier pour la
-- seule verification retirait les droits du super admin. Decommentez pour executer.

-- UPDATE admin_users
-- SET
--   is_super_admin = false,
--   role = 'admin'
-- WHERE email = 'superadmin@attabl.com';

-- Vérification
SELECT email, role, is_super_admin FROM admin_users WHERE email = 'superadmin@attabl.com';


-- ==========================================
-- OPTION 2: SUPPRIMER LE COMPTE SUPER ADMIN
-- ==========================================
-- ATTENTION: Supprime complètement le compte
-- Décommentez pour exécuter

-- DELETE FROM admin_users WHERE email = 'superadmin@attabl.com';
-- Note: Il faudra aussi supprimer l'utilisateur dans auth.users via Supabase Dashboard


-- ==========================================
-- OPTION 3: CHANGER LE MOT DE PASSE
-- ==========================================
-- Utilisez l'API Supabase Admin pour changer le mot de passe
-- Voir le script Node.js ci-dessous


-- ==========================================
-- VÉRIFICATIONS POST-PRODUCTION
-- ==========================================

-- Lister tous les super admins (devrait être vide en production)
SELECT
  au.email,
  au.role,
  au.is_super_admin,
  t.slug as tenant
FROM admin_users au
LEFT JOIN tenants t ON au.tenant_id = t.id
WHERE au.is_super_admin = true OR au.role = 'super_admin';

-- Verifier que la RLS est ACTIVE sur chaque table (B153: lire pg_policies ne
-- le dit pas, une table peut porter des policies avec la RLS desactivee).
-- Toute ligne renvoyee ici est une table publique SANS RLS.
SELECT tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;

-- Policies par table, pour lecture
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public';
