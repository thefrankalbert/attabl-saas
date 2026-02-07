-- =====================================================
-- SCRIPTS DE SÉCURITÉ SUPER ADMIN - ATTABL
-- Exécuter AVANT la mise en production
-- =====================================================

-- ==========================================
-- OPTION 1: DÉSACTIVER LE SUPER ADMIN
-- ==========================================
-- Retire tous les privilèges Super Admin

UPDATE admin_users
SET
  is_super_admin = false,
  role = 'admin'
WHERE email = 'superadmin@attabl.com';

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

-- Vérifier les policies RLS sont actives
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public';
