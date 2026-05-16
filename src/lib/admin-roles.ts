export const ONBOARDING_COMPLETE_ROLES = ['owner'] as const;

export const ASSIGNMENT_MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

export function isRoleAllowed(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
