// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import RoleGuard from '../RoleGuard';

// ─── Mocks ──────────────────────────────────────────────

const mockPermissions = {
  role: 'admin' as const,
  can: vi.fn(() => true),
  permissions: {},
};

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── Tests ──────────────────────────────────────────────

describe('RoleGuard', () => {
  beforeEach(() => {
    mockPermissions.role = 'admin';
    mockPermissions.can = vi.fn(() => true);
  });

  it('renders children when user has required role', () => {
    render(
      <RoleGuard roles={['admin', 'owner']}>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renders children when user has required permission', () => {
    render(
      <RoleGuard permission="canManageMenus">
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(mockPermissions.can).toHaveBeenCalledWith('canManageMenus');
  });

  it('shows AccessDenied when role is not in whitelist', () => {
    mockPermissions.role = 'waiter' as 'admin';

    render(
      <RoleGuard roles={['admin', 'owner']}>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
  });

  it('shows AccessDenied when permission check fails', () => {
    mockPermissions.can = vi.fn(() => false);

    render(
      <RoleGuard permission="canManageUsers">
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
  });

  it('renders custom fallback when access denied', () => {
    mockPermissions.role = 'waiter' as 'admin';

    render(
      <RoleGuard roles={['owner']} fallback={<div data-testid="custom-fallback">No access</div>}>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('renders children when no permission or roles specified', () => {
    render(
      <RoleGuard>
        <div data-testid="protected">Open content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });
});
