#!/usr/bin/env node

/**
 * Script de gestion du Super Admin - ATTABL
 *
 * Usage:
 *   node scripts/manage-super-admin.js [action]
 *
 * Actions:
 *   status    - Affiche le statut du super admin
 *   disable   - Désactive les privilèges super admin
 *   enable    - Réactive les privilèges super admin
 *   password  - Change le mot de passe (demande le nouveau)
 *   delete    - Supprime le compte super admin (DANGER)
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const readline = require('readline');
const { supabasePgConfig } = require('./lib/supabase-pg-ssl.cjs');

// Configuration - Load from environment variables
// Run with: source .env.local && node scripts/manage-super-admin.js [action]
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DATABASE_URL) {
  console.error("❌ Variables d'environnement manquantes.");
  console.error('Exécutez: source .env.local && node scripts/manage-super-admin.js [action]');
  process.exit(1);
}

const SUPER_ADMIN_EMAIL = 'superadmin@attabl.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// Encrypted and verified, or no connection (see scripts/lib/supabase-pg-ssl.cjs).
let pgClient;
try {
  pgClient = new Client(supabasePgConfig(DATABASE_URL, process.env.SUPABASE_DB_CA_CERT));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getStatus() {
  await pgClient.connect();

  const result = await pgClient.query(
    `
    SELECT
      au.email,
      au.role,
      au.is_super_admin,
      au.is_active,
      t.slug as tenant_slug
    FROM admin_users au
    LEFT JOIN tenants t ON au.tenant_id = t.id
    WHERE au.email = $1
  `,
    [SUPER_ADMIN_EMAIL],
  );

  await pgClient.end();

  if (result.rows.length === 0) {
    console.log('\n❌ Super Admin non trouvé dans admin_users');
    return null;
  }

  const admin = result.rows[0];
  console.log('\n=== STATUT SUPER ADMIN ===');
  console.log('Email:', admin.email);
  console.log('Role:', admin.role);
  console.log('Super Admin:', admin.is_super_admin ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ');
  console.log('Actif:', admin.is_active ? 'Oui' : 'Non');
  console.log('Tenant:', admin.tenant_slug);

  return admin;
}

async function disableSuperAdmin() {
  await pgClient.connect();

  await pgClient.query(
    `
    UPDATE admin_users
    SET is_super_admin = false, role = 'admin'
    WHERE email = $1
  `,
    [SUPER_ADMIN_EMAIL],
  );

  await pgClient.end();

  console.log('\n✅ Privilèges Super Admin DÉSACTIVÉS');
  console.log('Le compte peut toujours accéder à son tenant assigné.');
}

async function enableSuperAdmin() {
  await pgClient.connect();

  await pgClient.query(
    `
    UPDATE admin_users
    SET is_super_admin = true, role = 'super_admin'
    WHERE email = $1
  `,
    [SUPER_ADMIN_EMAIL],
  );

  await pgClient.end();

  console.log('\n✅ Privilèges Super Admin ACTIVÉS');
}

async function changePassword() {
  const newPassword = await prompt('Nouveau mot de passe: ');

  if (!newPassword || newPassword.length < 8) {
    console.log('❌ Mot de passe trop court (min 8 caractères)');
    return;
  }

  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const user = users?.find((u) => u.email === SUPER_ADMIN_EMAIL);

  if (!user) {
    console.log('❌ Utilisateur non trouvé dans Supabase Auth');
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (error) {
    console.log('❌ Erreur:', error.message);
    return;
  }

  console.log('\n✅ Mot de passe changé avec succès');
}

async function deleteSuperAdmin() {
  const confirm = await prompt(
    '⚠️ ATTENTION: Cette action est irréversible. Tapez "SUPPRIMER" pour confirmer: ',
  );

  if (confirm !== 'SUPPRIMER') {
    console.log('❌ Opération annulée');
    return;
  }

  // Supprimer de admin_users
  await pgClient.connect();
  await pgClient.query('DELETE FROM admin_users WHERE email = $1', [SUPER_ADMIN_EMAIL]);
  await pgClient.end();

  // Supprimer de auth.users
  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const user = users?.find((u) => u.email === SUPER_ADMIN_EMAIL);

  if (user) {
    await supabase.auth.admin.deleteUser(user.id);
  }

  console.log('\n✅ Compte Super Admin SUPPRIMÉ');
}

async function main() {
  const action = process.argv[2] || 'status';

  console.log('🔐 Gestion Super Admin - ATTABL');
  console.log('================================\n');

  try {
    switch (action) {
      case 'status':
        await getStatus();
        break;
      case 'disable':
        await disableSuperAdmin();
        await getStatus();
        break;
      case 'enable':
        await enableSuperAdmin();
        await getStatus();
        break;
      case 'password':
        await changePassword();
        break;
      case 'delete':
        await deleteSuperAdmin();
        break;
      default:
        console.log('Actions disponibles: status, disable, enable, password, delete');
    }
  } catch (error) {
    console.error('Erreur:', error.message);
  }

  process.exit(0);
}

main();
