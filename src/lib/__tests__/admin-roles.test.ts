import { describe, expect, it } from 'vitest';
import { ASSIGNMENT_MANAGER_ROLES, isRoleAllowed, ONBOARDING_COMPLETE_ROLES } from '../admin-roles';

describe('admin-roles', () => {
  it('allows owner to complete onboarding', () => {
    expect(isRoleAllowed('owner', ONBOARDING_COMPLETE_ROLES)).toBe(true);
  });

  it('denies manager from completing onboarding', () => {
    expect(isRoleAllowed('manager', ONBOARDING_COMPLETE_ROLES)).toBe(false);
  });

  it('allows manager to manage assignments', () => {
    expect(isRoleAllowed('manager', ASSIGNMENT_MANAGER_ROLES)).toBe(true);
  });

  it('denies waiter from managing assignments', () => {
    expect(isRoleAllowed('waiter', ASSIGNMENT_MANAGER_ROLES)).toBe(false);
  });
});
