/**
 * A tenant the current user can switch to from the admin shell tenant switcher.
 * Produced in the admin layout from the user's admin_users memberships.
 */
export interface TenantSwitchOption {
  id: string;
  name: string;
  slug: string;
}
