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
import { adminPasswordResetLinkLimiter } from '@/lib/rate-limit';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { createAuditService } from '@/services/audit.service';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { checkTenantAdminPermissions } from '@/lib/auth/check-tenant-admin';
import { revalidateTenantUsersPath } from '@/lib/admin/revalidate-tenant-users';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

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

  // Vérification des limites du plan
  try {
    const planService = createPlanEnforcementService(adminClient);

    // Récupérer le tenant avec les infos de plan
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return { error: t('tenantNotFound') };
    }

    await planService.canAddAdmin(tenant);
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('planLimitError') };
  }

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

  // SECURITY: prevent privilege escalation when changing a role.
  if (parsed.data.role && !canGrantRole(currentRole, parsed.data.role)) {
    return { error: t('permissionDenied') };
  }

  const adminClient = createAdminClient();

  // SECURITY: verify the actor outranks the target's CURRENT role before any
  // mutation - covers is_active / full_name too, not only role changes - so an
  // admin cannot disable or demote the owner.
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!targetUser) return { error: t('userNotFound') };
  if (!canActOnUser(currentRole, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
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

  // 1. LIMITATION DE DEBIT (reserve R2' point 3 du contre-audit LOT 4).
  // Cette action envoie un courriel reel sur la boite du titulaire; elle
  // n'avait AUCUNE borne, alors que son equivalent public
  // /api/forgot-password est a 3 par 10 minutes et que
  // .claude/rules/05-backend-api.md impose la limitation en premiere etape.
  //
  // La cle porte sur le COMPTE CIBLE, pas sur l'IP: le prejudice est par boite
  // aux lettres (harcelement du titulaire, usure de la reputation d'expedition
  // du domaine), un restaurant entier sort par une seule IP - une cle par IP
  // ferait collisionner des administrateurs legitimes - et un attaquant change
  // d'IP a volonte. Fail-closed (voir le limiteur).
  //
  // Le refus reutilise le message generique des autres refus de cette action:
  // dire "quota atteint sur ce compte" renseignerait l'appelant sur l'activite
  // d'un compte qu'il n'a pas forcement le droit de connaitre.
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

  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkTenantAdminPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

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
  // ne compte plus dans le verdict `cross_tenant` (voir
  // src/lib/auth/target-account-scope.ts). Le cas redevient donc recuperable
  // sans l'attaquant. Et le titulaire, lui, n'a jamais ete bloque: il reste
  // libre d'utiliser "mot de passe oublie" depuis la page de connexion.
  const scope = await checkTargetAccountScope(adminClient, targetUser.user_id, tenantId);
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

  const t = await getTranslations('errors');

  // Validation Zod de l'entree (remplace le test regex artisanal).
  const parsedEmail = updateUserEmailSchema.safeParse({ email: newEmail });
  if (!parsedEmail.success) {
    return { error: t('invalidEmail') };
  }
  const nextEmail = parsedEmail.data.email;

  const adminClient = createAdminClient();

  // Get the auth user_id from admin_users
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!targetUser) return { error: t('userNotFound') };

  // SECURITY: an actor cannot change the email of a peer or higher-ranked
  // account (e.g. an admin taking over the owner).
  if (!canActOnUser(role, targetUser.role as AdminRole)) {
    return { error: t('permissionDenied') };
  }

  // SECURITE (ACT-14): meme garde de perimetre que la reinitialisation de mot
  // de passe. Changer l'email d'un compte partage avec un autre tenant, ou d'un
  // compte plateforme, revient a en prendre le controle (l'adresse sert ensuite
  // a demander un lien de reinitialisation). Message generique.
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
