'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { AdminRole, AdminUser } from '@/types/admin.types';
import { canGrantRole, canActOnUser } from '@/lib/auth/role-hierarchy';
import {
  createAdminUserSchema,
  updateAdminUserSchema,
  updateUserEmailSchema,
} from '@/lib/validations/admin-user.schema';
import { checkTargetAccountScope } from '@/lib/auth/target-account-scope';
import { isEmailAlreadyRegisteredAuthError } from '@/lib/auth/is-email-already-registered';
import { sendPasswordResetEmail } from '@/services/email.service';
import {
  adminPasswordResetLinkLimiter,
  adminPasswordResetLinkIpLimiter,
  getClientIpFromHeaders,
} from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { createPlanEnforcementService, STAFF_ROLES } from '@/services/plan-enforcement.service';
import { createAuditService } from '@/services/audit.service';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { checkTenantAdminPermissions } from '@/lib/auth/check-tenant-admin';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { revalidateTenantUsersPath } from '@/lib/admin/revalidate-tenant-users';
import { getStorageCleanup } from '@/services/storage-cleanup.service';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

/**
 * Plan seat check for a member who is about to hold `role` while active.
 * Staff roles count against maxStaff, owner/admin against maxAdmins, as in the
 * invitation routes. Returns an error message, or null when a seat is free.
 * Shared by creation, role change and reactivation: a quota that only one of
 * those paths checks is not a quota.
 */
async function checkSeatQuota(
  adminClient: ReturnType<typeof createAdminClient>,
  tenantId: string,
  role: string,
  t: (key: string) => string,
): Promise<string | null> {
  try {
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();
    if (tenantError || !tenant) return t('tenantNotFound');

    const planService = createPlanEnforcementService(adminClient);
    if ((STAFF_ROLES as readonly string[]).includes(role)) {
      await planService.canAddStaff(tenant);
    } else {
      await planService.canAddAdmin(tenant);
    }
    return null;
  } catch (err) {
    return err instanceof ServiceError ? err.message : t('planLimitError');
  }
}

const isStaffRole = (role: string): boolean => (STAFF_ROLES as readonly string[]).includes(role);

/**
 * Coupure du restaurant: renvoie le message de refus, ou null s'il sert encore.
 * Appelee APRES la preuve d'appartenance (un inconnu ne doit pas apprendre
 * l'etat d'un restaurant). Retirer ou desactiver un membre n'appelle PAS cette
 * garde: couper l'acces d'un ex-employe reste permis meme restaurant coupe.
 * C'est la seule sortie d'equipe (une retrogradation est refusee), et un super
 * admin est refuse aussi depuis le tableau de bord: on deverrouille par la
 * console plateforme.
 */
async function tenantLockError(tenantId: string): Promise<string | null> {
  try {
    await assertTenantServing(tenantId);
    return null;
  } catch (err) {
    if (err instanceof TenantLockedError) return err.message;
    throw err;
  }
}

/**
 * Creates a new admin user for a tenant.
 */
export async function actionCreateAdminUser(
  tenantId: string,
  formData: { email: string; password: string; full_name: string; role: string },
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
    adminUserId: actorAdminUserId,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const lockError = await tenantLockError(tenantId);
  if (lockError) return { error: lockError };

  // Validation Zod des données d'entrée
  const parsed = createAdminUserSchema.safeParse({
    email: formData.email,
    password: formData.password,
    full_name: formData.full_name,
    role: formData.role,
  });
  const t = await getTranslations('errors');

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || t('invalidData') };
  }

  // SECURITY: prevent privilege escalation (e.g. an admin creating an owner).
  if (!canGrantRole(role, parsed.data.role)) {
    return { error: t('permissionDenied') };
  }

  const adminClient = createAdminClient();

  const quotaError = await checkSeatQuota(adminClient, tenantId, parsed.data.role, t);
  if (quotaError) return { error: quotaError };

  // 1. Create Auth User
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (authError) {
    // SECURITE (reserve S5): le message GoTrue brut ("A user with this email
    // address has already been registered") renvoye tel quel faisait de ce
    // formulaire un oracle d'enumeration de comptes de la plateforme. Message
    // generique au client, detail dans les logs serveur (sans l'adresse: PII).
    logger.error('actionCreateAdminUser: creation du compte auth refusee', {
      tenantId,
      emailDejaUtilise: isEmailAlreadyRegisteredAuthError(authError),
      error: authError.message,
    });
    return { error: t('userCreationError') };
  }

  if (!authUser.user) {
    return { error: t('userCreationError') };
  }

  // 2. Insert into admin_users linked to tenant
  const { error: dbError } = await adminClient.from('admin_users').insert({
    id: crypto.randomUUID(),
    user_id: authUser.user.id,
    tenant_id: tenantId,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    is_active: true,
    // FK admin_users_created_by_fkey references admin_users(id), NOT auth.users.
    // currentUser.id is the auth user id; use the actor's membership-row PK.
    created_by: actorAdminUserId,
  });

  if (dbError) {
    // Rollback Auth User
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    // Message generique: le detail Postgres (contrainte, colonne, table)
    // renseignait le client sur le schema. Il reste dans les logs serveur.
    logger.error('actionCreateAdminUser: liaison au tenant impossible', {
      tenantId,
      error: dbError.message,
    });
    return { error: t('tenantLinkError') };
  }

  // Fire-and-forget audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser!.id,
    userEmail: currentUser!.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'create',
    entityType: 'user',
    entityId: authUser.user.id,
    newData: { email: parsed.data.email, full_name: parsed.data.full_name, role: parsed.data.role },
  });

  await revalidateTenantUsersPath(adminClient, tenantId);

  return { success: true };
}

/**
 * Deletes an admin user.
 * Vérifie si l'utilisateur appartient à d'autres tenants avant de supprimer le compte auth.
 */
export async function actionDeleteAdminUser(
  tenantId: string,
  userId: string,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const adminClient = createAdminClient();

  // Get the user to find auth_id
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email, full_name, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  const t = await getTranslations('errors');

  if (!targetUser) return { error: t('userNotFound') };

  // SECURITY: an actor cannot delete a peer or higher-ranked account (e.g. an
  // admin deleting the owner).
  if (!canActOnUser(role, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
  }

  // SECURITE (constat C-3). Cette action etait la SEULE des trois a ne pas
  // appeler le garde de perimetre, alors qu'elle est la plus destructrice:
  // `delete_admin_user_atomic` supprime la ligne, recompte les appartenances du
  // compte auth, et s'il n'en reste aucune elle fait `DELETE FROM auth.users`
  // (supabase/migrations/20260401000001_atomic_user_cleanup.sql) - une
  // destruction de compte globale, irreversible. Les lignes `admin_users`
  // parasites deja posees en production n'ont jamais ete nettoyees (voir le
  // commentaire de `actionResetUserPassword`), donc le chemin est atteignable.
  //
  // Perimetre du refus, et ce qui est DELIBEREMENT laisse passer:
  //  - `platform_account` / `lookup_failed` REFUSENT. Un compte d'operateur de
  //    la plateforme n'est jamais gerable par un admin de tenant, et une lecture
  //    d'appartenances qui echoue ne doit pas aboutir a une destruction.
  //  - `cross_tenant` est AUTORISE, et c'est lu dans le corps de la RPC, pas
  //    suppose: si la cible garde une appartenance ailleurs, `remaining_count`
  //    vaut au moins 1 et le compte auth est CONSERVE - seule la ligne du tenant
  //    appelant part. Refuser ce cas serait une regression pure (un
  //    proprietaire doit pouvoir retirer de SON equipe un employe partage avec
  //    un autre restaurant), pour aucun gain de securite.
  const scope = await checkTargetAccountScope(adminClient, targetUser.user_id, tenantId);
  if (!scope.allowed && scope.reason !== 'cross_tenant') {
    logger.warn('actionDeleteAdminUser refuse: compte cible hors perimetre du tenant', {
      tenantId,
      adminUserId: userId,
      reason: scope.reason,
    });
    return { error: t('permissionDenied') };
  }

  // Atomically delete admin_users row and clean up auth user if no memberships remain.
  // The RPC uses SELECT FOR UPDATE to prevent race conditions.
  const { data: authDeleted, error: rpcError } = await adminClient.rpc('delete_admin_user_atomic', {
    p_admin_user_id: userId,
    p_user_id: targetUser.user_id,
  });

  if (rpcError) {
    logger.error('actionDeleteAdminUser: suppression atomique refusee', {
      tenantId,
      adminUserId: userId,
      error: rpcError.message,
    });
    return { error: t('serverError') };
  }

  // Dernier membre: la fonction SQL a supprime le restaurant entier. Ses fichiers
  // (logo, photos, sons) ne sont pas dans la base et restaient indefiniment. La
  // purge ne s'execute que si la ligne du restaurant a bien disparu (R-05).
  await getStorageCleanup().purgeTenant(tenantId);

  if (authDeleted) {
    logger.info('Auth user deleted (no remaining memberships)', {
      userId: targetUser.user_id,
    });
  }

  // Fire-and-forget audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'delete',
    entityType: 'user',
    entityId: userId,
    oldData: { email: targetUser.email, full_name: targetUser.full_name, role: targetUser.role },
  });

  await revalidateTenantUsersPath(adminClient, tenantId);

  return { success: true };
}

/**
 * Updates a user's role or details.
 */
export async function actionUpdateAdminUser(
  tenantId: string,
  userId: string,
  data: Partial<AdminUser>,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role: currentRole,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  // Validate input with Zod before DB write
  const parsed = updateAdminUserSchema.safeParse(data);
  const t = await getTranslations('errors');
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || t('invalidData') };
  }

  // Coupure du restaurant: seule la desactivation PURE d'un membre reste permise
  // (securite: couper l'acces d'un ex-employe). Tout autre changement (role,
  // nom, permissions, reactivation) est une ecriture refusee.
  const isPureDeactivation =
    parsed.data.is_active === false &&
    parsed.data.role === undefined &&
    parsed.data.full_name === undefined &&
    parsed.data.custom_permissions === undefined;
  if (!isPureDeactivation) {
    const lockError = await tenantLockError(tenantId);
    if (lockError) return { error: lockError };
  }

  // SECURITY: prevent privilege escalation when changing a role.
  if (parsed.data.role && !canGrantRole(currentRole, parsed.data.role)) {
    return { error: t('permissionDenied') };
  }

  // SECURITY: seules les permissions INDIVIDUELLES priment sur tout le reste
  // (hasPermission, etape 1). Les laisser a l'admin contournait la regle "seul
  // le proprietaire regle les permissions" (/api/permissions, verifyOwner): un
  // admin pouvait donner l'encaissement a un serveur ou les reglages a un
  // caissier. Decision du proprietaire du 2026-11-09.
  if (parsed.data.custom_permissions !== undefined && currentRole !== 'owner') {
    return { error: t('permissionDenied') };
  }

  const adminClient = createAdminClient();

  // SECURITY: verify the actor outranks the target's CURRENT role before any
  // mutation - covers is_active / full_name too, not only role changes - so an
  // admin cannot disable or demote the owner.
  //
  // SECURITE (refutation R2 point 2.2 du contre-audit LOT 6): `.is('deleted_at',
  // null)`. Sans ce filtre, un admin du tenant pouvait remettre `is_active =
  // true` sur une ligne que la PLATEFORME venait de retirer par soft-delete
  // (`platform-admin.service.ts`, `softDeleteAdminUser`), et donc ANNULER la
  // remediation d'une ligne `admin_users` parasite - la seule sortie de la
  // boucle d'attaque ACT-14. Un retrait plateforme n'etait pas un etat stable.
  // Aucune regression: la ligne a deja disparu de l'interface du tenant
  // (`admin/users/page.tsx` filtre `deleted_at`), et la restauration garde son
  // chemin dedie, `restoreAdminUser`, reserve au super_admin.
  // La policy RESTRICTIVE posee par 20261105000000 dit la meme chose en base,
  // mais elle ne couvre pas ce chemin: cette action ecrit avec le client
  // service_role, qui ignore le RLS. Les deux couches sont necessaires.
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('role, is_active')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!targetUser) return { error: t('userNotFound') };
  if (!canActOnUser(currentRole, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
  }

  // A seat is taken when the member becomes active again, or moves between the
  // staff and admin quotas while active. Without this, demote-then-promote or
  // deactivate-then-reactivate went around the plan limit.
  const nextRole = parsed.data.role ?? targetUser.role;
  const nextActive = parsed.data.is_active ?? targetUser.is_active !== false;
  const takesNewSeat =
    nextActive &&
    (targetUser.is_active === false || isStaffRole(nextRole) !== isStaffRole(targetUser.role));
  if (takesNewSeat) {
    const quotaError = await checkSeatQuota(adminClient, tenantId, nextRole, t);
    if (quotaError) return { error: quotaError };
  }

  // Only send keys that were provided. custom_permissions: an object sets the
  // overrides, null clears them (member falls back to role permissions),
  // undefined leaves them untouched.
  const updatePayload: {
    role?: AdminRole;
    full_name?: string;
    is_active?: boolean;
    custom_permissions?: Record<string, boolean> | null;
  } = {
    role: parsed.data.role,
    full_name: parsed.data.full_name,
    is_active: parsed.data.is_active,
  };
  if (parsed.data.custom_permissions !== undefined) {
    updatePayload.custom_permissions = parsed.data.custom_permissions;
  }

  const { error } = await adminClient
    .from('admin_users')
    .update(updatePayload)
    .eq('id', userId)
    .eq('tenant_id', tenantId); // Safety check

  if (error) {
    logger.error('actionUpdateAdminUser: mise a jour refusee', {
      tenantId,
      adminUserId: userId,
      error: error.message,
    });
    return { error: t('serverError') };
  }

  // Fire-and-forget audit log. A permission-only change is logged as a
  // 'permission' entity so it stands out in the audit trail.
  const permissionsChanged = parsed.data.custom_permissions !== undefined;
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: currentRole ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: permissionsChanged ? 'permission' : 'user',
    entityId: userId,
    newData: {
      role: data.role,
      full_name: data.full_name,
      is_active: data.is_active,
      ...(permissionsChanged ? { custom_permissions: parsed.data.custom_permissions } : {}),
    },
  });

  await revalidateTenantUsersPath(adminClient, tenantId);

  return { success: true };
}

/**
 * Envoie a un collaborateur un lien de reinitialisation de mot de passe.
 *
 * SECURITE (constat ACT-14): cette action NE FIXE PLUS le mot de passe d'un
 * tiers. Avant, elle ecrivait directement `password` sur le compte auth global
 * de la cible: couplee a l'ajout direct dans admin_users (voir
 * invitation.service.ts), elle permettait de prendre le controle du compte de
 * n'importe qui, super_admin inclus, en ne connaissant que son email. Seul le
 * titulaire peut desormais choisir son mot de passe, via le lien recu sur sa
 * propre adresse.
 *
 * L'action ne prend plus de mot de passe en parametre: il n'y a plus rien a en
 * faire, et le conserver faisait transiter un secret par le reseau pour le
 * jeter (l'UI affichait "utilisateur mis a jour" sans que rien ne change).
 */
export async function actionResetUserPassword(
  tenantId: string,
  userId: string,
): Promise<ActionResponse> {
  const t = await getTranslations('errors');

  // 1. LIMITATION DE DEBIT, PREMIERE ETAPE: par IP (reserve R2' point 3 du
  // contre-audit LOT 4, recadree par la reserve S1 du contre-audit LOT 6).
  // Cette action envoie un courriel reel sur la boite du titulaire; elle
  // n'avait AUCUNE borne, alors que son equivalent public
  // /api/forgot-password est a 3 par 10 minutes et que
  // .claude/rules/05-backend-api.md impose la limitation en premiere etape.
  //
  // La cle de PREMIERE etape ne peut pas etre le compte cible: a cette place
  // elle est consommable par un appelant qui n'a passe aucun controle
  // d'identite (tout membre du tenant lit `admin_users.id` de ses collegues),
  // ce qui coupe le depannage par le patron pendant une heure, et le refus par
  // quota arrivant AVANT la branche "non authentifie" rend les deux etats
  // distinguables - un oracle d'activite de compte. Une cle par IP ne depend
  // d'aucun parametre client, donc elle n'est pas dirigeable contre un compte
  // choisi. Le limiteur par compte cible, qui porte le vrai prejudice, est
  // consomme plus bas, APRES l'authentification.
  const { success: withinIpQuota } = await adminPasswordResetLinkIpLimiter.check(
    getClientIpFromHeaders(await headers()),
  );
  if (!withinIpQuota) {
    logger.warn('actionResetUserPassword refuse: quota d envoi atteint pour cette IP', {
      tenantId,
    });
    return { error: t('permissionDenied') };
  }

  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  // Coupure du restaurant: envoyer un lien de reinitialisation est une ecriture
  // de service (un courriel reel part vers la boite du collaborateur).
  const lockError = await tenantLockError(tenantId);
  if (lockError) return { error: lockError };

  // 2. LIMITATION DE DEBIT, DEUXIEME ETAPE: par COMPTE CIBLE, une fois
  // l'appelant authentifie et reconnu owner/admin du tenant. Le prejudice est
  // par boite aux lettres (harcelement du titulaire, usure de la reputation
  // d'expedition du domaine, donc delivrabilite de TOUS les courriels ATTABL),
  // et un restaurant entier sort par une seule IP. Fail-closed (voir le
  // limiteur).
  //
  // Le refus reutilise le message generique des autres refus de cette action:
  // dire "quota atteint sur ce compte" renseignerait l'appelant sur l'activite
  // d'un compte qu'il n'a pas forcement le droit de connaitre. Place ici, il
  // tombe de toute facon dans la meme branche que les autres refus de
  // permission, donc il ne distingue plus rien.
  const { success: withinResetQuota } = await adminPasswordResetLinkLimiter.check(
    `${tenantId}:${userId}`,
  );
  if (!withinResetQuota) {
    logger.warn('actionResetUserPassword refuse: quota d envoi atteint sur le compte cible', {
      tenantId,
      adminUserId: userId,
    });
    return { error: t('permissionDenied') };
  }

  const adminClient = createAdminClient();

  // Get the auth user_id from admin_users
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!targetUser) return { error: t('userNotFound') };

  // SECURITY: an actor cannot reset the password of a peer or higher-ranked
  // account (e.g. an admin taking over the owner).
  if (!canActOnUser(role, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
  }

  // SECURITE (ACT-14, refutation R2 du contre-audit LOT 2, puis refutation R2'
  // du contre-audit LOT 4). Garde FAIL-CLOSED sur les trois raisons, comme pour
  // le changement d'email.
  //
  // Le lot precedent avait relache `cross_tenant` ici, au motif que "depuis R1
  // ferme, il ne subsiste que des appartenances consenties". Cette premisse est
  // fausse au moment ou le code part: la migration qui retire la lecture du
  // jeton n'est pas appliquee, et surtout aucune remediation des lignes
  // `admin_users` parasites DEJA posees en production n'a ete livree. Net, le
  // relachement augmentait ce qu'un attaquant deja installe peut faire a sa
  // victime: declencher a volonte l'envoi d'un lien de recuperation sur sa
  // boite reelle. On ne relache pas un controle sur une promesse de nettoyage.
  //
  // Le deni de service decrit par R2 (le proprietaire legitime ne pouvait plus
  // depanner son employe, et n'avait aucun moyen de retirer la ligne posee par
  // un autre tenant) est traite a sa cause, pas en ouvrant le garde: une ligne
  // retiree par la PLATEFORME (console super-admin, `actionSoftDeleteAdminUser`)
  // ne compte plus dans le verdict `cross_tenant`. Le cas redevient donc
  // recuperable sans l'attaquant. Et le titulaire, lui, n'a jamais ete bloque:
  // il reste libre d'utiliser "mot de passe oublie" depuis la page de connexion.
  //
  // Ce relachement est DEMANDE ICI, et ici seulement (refutation R2 du
  // contre-audit LOT 6): pose en defaut dans le garde partage, il descendait
  // aussi sur `actionUpdateUserEmail`, qui ecrit l'identite du compte auth.
  // Le pire effet de CETTE action reste un courriel envoye sur la boite du
  // titulaire, qui n'ouvre rien a l'appelant.
  const scope = await checkTargetAccountScope(adminClient, targetUser.user_id, tenantId, {
    ignoreSoftDeletedMemberships: true,
  });
  if (!scope.allowed) {
    logger.warn('actionResetUserPassword refuse: compte cible hors perimetre du tenant', {
      tenantId,
      adminUserId: userId,
      reason: scope.reason,
    });
    return { error: t('permissionDenied') };
  }

  // L'adresse du titulaire est celle du COMPTE AUTH, pas la colonne
  // admin_users.email (qui n'est qu'un miroir applicatif modifiable).
  const { data: authTarget, error: authLookupError } = await adminClient.auth.admin.getUserById(
    targetUser.user_id,
  );
  const ownerEmail = authTarget?.user?.email;
  if (authLookupError || !ownerEmail) {
    logger.error('actionResetUserPassword: compte auth introuvable', {
      tenantId,
      adminUserId: userId,
      error: authLookupError?.message,
    });
    return { error: t('serverError') };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: ownerEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    logger.error('actionResetUserPassword: generation du lien de recuperation echouee', {
      tenantId,
      adminUserId: userId,
      error: linkError?.message,
    });
    return { error: t('serverError') };
  }

  const resetUrl = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery`;
  const emailSent = await sendPasswordResetEmail(ownerEmail, { resetUrl });
  if (!emailSent) {
    logger.error('actionResetUserPassword: envoi du lien de reinitialisation echoue', {
      tenantId,
      adminUserId: userId,
    });
    return { error: t('serverError') };
  }

  // Audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: 'user',
    entityId: userId,
    newData: { passwordResetLinkSent: true },
  });

  return { success: true };
}

/**
 * Updates a collaborator's email (admin-only).
 */
export async function actionUpdateUserEmail(
  tenantId: string,
  userId: string,
  newEmail: string,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const lockError = await tenantLockError(tenantId);
  if (lockError) return { error: lockError };

  const t = await getTranslations('errors');

  // Validation Zod de l'entree (remplace le test regex artisanal).
  const parsedEmail = updateUserEmailSchema.safeParse({ email: newEmail });
  if (!parsedEmail.success) {
    return { error: t('invalidEmail') };
  }
  const nextEmail = parsedEmail.data.email;

  const adminClient = createAdminClient();

  // Get the auth user_id from admin_users
  //
  // SECURITE (meme invariant que `actionUpdateAdminUser`, refutation R2 point
  // 2.2): une ligne retiree par la plateforme est GELEE pour le tenant. Ici
  // l'enjeu est plus lourd qu'une reactivation - cette action ecrit l'identite
  // du compte auth (la primitive ACT-14) - et le geste n'a aucun appelant
  // legitime: la ligne n'est plus affichee dans l'equipe du tenant.
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single();

  if (!targetUser) return { error: t('userNotFound') };

  // SECURITY: an actor cannot change the email of a peer or higher-ranked
  // account (e.g. an admin taking over the owner).
  if (!canActOnUser(role, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
  }

  // SECURITE (ACT-14): meme garde de perimetre que la reinitialisation de mot
  // de passe, mais en version STRICTE. Changer l'email d'un compte partage avec
  // un autre tenant, ou d'un compte plateforme, revient a en prendre le
  // controle (l'adresse sert ensuite a demander un lien de reinitialisation).
  // Message generique.
  //
  // Pas de `ignoreSoftDeletedMemberships` ici, et c'est le point de la
  // refutation R2 du contre-audit LOT 6: une appartenance retiree par la
  // plateforme compte toujours pour CETTE action. Sinon la configuration
  // suivante - qui est le geste normal, pas un cas tordu - ouvrait le passage:
  // un super_admin desinscrit un employe de son restaurant d'origine
  // (`softDeleteAdminUser`), il ne reste plus que la ligne de l'autre tenant,
  // et l'admin de cet autre tenant gagne le droit de reecrire l'adresse du
  // compte auth de cet employe.
  const scope = await checkTargetAccountScope(adminClient, targetUser.user_id, tenantId);
  if (!scope.allowed) {
    logger.warn('actionUpdateUserEmail refuse: compte cible hors perimetre du tenant', {
      tenantId,
      adminUserId: userId,
      reason: scope.reason,
    });
    return { error: t('permissionDenied') };
  }

  // Update auth email.
  // SECURITE (ACT-14): PAS de `email_confirm: true`. Auto-confirmer faisait
  // basculer l'identite du compte auth sans que le titulaire valide quoi que ce
  // soit. Supabase envoie maintenant une demande de confirmation a la nouvelle
  // adresse: le changement ne prend effet sur le compte auth qu'apres son
  // accord. La ligne admin_users, elle, reflete tout de suite l'adresse
  // demandee (c'est l'affichage de l'equipe, pas l'identite de connexion).
  //
  // HYPOTHESE NON MESUREE (reserve S3 du contre-audit LOT 6), a ne pas lire
  // comme un fait: on suppose que GoTrue REFUSE `updateUserById({ email })`
  // vers une adresse deja prise par un autre compte, et que l'action s'arrete
  // donc avant d'ecrire le miroir. Si GoTrue acceptait, deux comptes auth
  // porteraient la meme adresse et le garde anti-doublon d'invitation
  // (`invitation.service.ts`, unicite sur (tenant_id, email)) serait
  // contournable. Il n'y a AUCUN controle d'unicite applicatif ici: en ajouter
  // un exigerait d'interroger la liste des comptes auth, donc de rouvrir
  // l'oracle d'enumeration que ces lots viennent de fermer. A trancher par une
  // mesure sur base jetable, pas par du code.
  const { error: authError } = await adminClient.auth.admin.updateUserById(targetUser.user_id, {
    email: nextEmail,
  });

  if (authError) {
    // SECURITE (reserve S5): meme oracle d'enumeration qu'a la creation - le
    // message GoTrue dit si l'adresse visee est deja prise. Generique au
    // client, detail dans les logs (sans l'adresse: PII).
    logger.error('actionUpdateUserEmail: changement d adresse refuse par auth', {
      tenantId,
      adminUserId: userId,
      emailDejaUtilise: isEmailAlreadyRegisteredAuthError(authError),
      error: authError.message,
    });
    return { error: t('serverError') };
  }

  // Update admin_users record
  const { error: dbError } = await adminClient
    .from('admin_users')
    .update({ email: nextEmail })
    .eq('id', userId)
    .eq('tenant_id', tenantId);

  if (dbError) {
    logger.error('actionUpdateUserEmail: miroir admin_users non mis a jour', {
      tenantId,
      adminUserId: userId,
      error: dbError.message,
    });
    return { error: t('serverError') };
  }

  // Audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: 'user',
    entityId: userId,
    oldData: { email: targetUser.email },
    newData: { email: nextEmail },
  });

  return { success: true };
}
