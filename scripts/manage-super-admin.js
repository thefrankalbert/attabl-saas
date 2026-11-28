#!/usr/bin/env node

/**
 * Script de gestion du Super Admin - ATTABL
 *
 * Usage:
 *   SUPER_ADMIN_TENANT_SLUG=<restaurant> node scripts/manage-super-admin.js [action]
 *
 * Actions:
 *   status    - Affiche le statut du super admin
 *   disable   - Désactive les privilèges super admin
 *   enable    - Réactive les privilèges super admin
 *   password  - Change le mot de passe (demande le nouveau)
 *   delete    - Supprime le compte super admin (DANGER)
 *
 * Chaque action cible UNE ligne : cet email dans CE restaurant
 * (SUPER_ADMIN_TENANT_SLUG, obligatoire). Les regles sont dans
 * scripts/lib/super-admin-ops.cjs.
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const readline = require('readline');
const { supabasePgConfig } = require('./lib/supabase-pg-ssl.cjs');
const ops = require('./lib/super-admin-ops.cjs');

// Configuration - Load from environment variables
// Run with: source .env.local && node scripts/manage-super-admin.js [action]
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_SLUG = process.env.SUPER_ADMIN_TENANT_SLUG;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DATABASE_URL) {
  console.error("❌ Variables d'environnement manquantes.");
  console.error('Exécutez: source .env.local && node scripts/manage-super-admin.js [action]');
  process.exit(1);
}

// Un email peut exister dans plusieurs restaurants : sans le restaurant, le
// script ne sait pas quelle ligne toucher, et il les touchait toutes.
if (!TENANT_SLUG) {
  console.error('❌ SUPER_ADMIN_TENANT_SLUG manquant.');
  console.error(
    'Indiquez le restaurant de la ligne visee : SUPER_ADMIN_TENANT_SLUG=<slug> node scripts/manage-super-admin.js [action]',
  );
  process.exit(1);
}

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@attabl.com';

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
  const admin = await ops.lireLigne(pgClient, SUPER_ADMIN_EMAIL, TENANT_SLUG);
  console.log('\n=== STATUT SUPER ADMIN ===');
  console.log('Email:', admin.email);
  console.log('Postes:', (admin.postes || []).join(' + ') || '(aucun : ligne de plateforme)');
  console.log('Super Admin:', admin.is_super_admin ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ');
  console.log('Actif:', admin.is_active ? 'Oui' : 'Non');
  console.log('Tenant:', admin.tenant_slug);
  return admin;
}

async function disableSuperAdmin() {
  const { lignePlateforme } = await ops.revoquer(pgClient, SUPER_ADMIN_EMAIL, TENANT_SLUG);
  console.log('\n✅ Privilèges Super Admin DÉSACTIVÉS');
  console.log(
    lignePlateforme
      ? 'Ligne de plateforme désactivée. "enable" la rétablit.'
      : 'Le compte reste membre actif de son restaurant, avec ses postes.',
  );
}

async function enableSuperAdmin() {
  await ops.activer(pgClient, SUPER_ADMIN_EMAIL, TENANT_SLUG);
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

  // La ligne ciblee seulement ; refuse pour un proprietaire.
  const { userId, lignesRestantes } = await ops.supprimer(pgClient, SUPER_ADMIN_EMAIL, TENANT_SLUG);

  // Le compte d'authentification ne part que s'il n'appartient plus a aucun
  // restaurant : sinon on detruirait l'acces d'un membre d'un autre restaurant.
  if (lignesRestantes > 0) {
    console.log(
      `\n✅ Ligne supprimée. Le compte est conservé : il lui reste ${lignesRestantes} ligne(s) ailleurs.`,
    );
    return;
  }
  if (userId) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(`compte auth non supprimé : ${error.message}`);
  }

  console.log('\n✅ Compte Super Admin SUPPRIMÉ');
}

async function main() {
  const action = process.argv[2] || 'status';

  console.log('🔐 Gestion Super Admin - ATTABL');
  console.log('================================\n');

  let code = 0;
  try {
    await pgClient.connect();
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
    code = 1;
  } finally {
    await pgClient.end().catch(() => {});
  }

  process.exit(code);
}

main();
