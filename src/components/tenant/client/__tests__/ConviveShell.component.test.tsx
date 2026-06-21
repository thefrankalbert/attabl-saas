// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ConviveShell } from '../ConviveShell';

// ─── Mocks ──────────────────────────────────────────────

let mockPathname = '/sites/lepicurien/menu';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('../BottomNav', () => ({
  ClientBottomNav: () => <div data-testid="bottom-nav" />,
}));

vi.mock('../FloatingCart', () => ({
  ClientFloatingCart: () => <div data-testid="floating-cart" />,
}));

// ─── Tests ──────────────────────────────────────────────

describe('ConviveShell', () => {
  beforeEach(() => {
    mockPathname = '/sites/lepicurien/menu';
  });

  function renderShell(slug: string) {
    return render(
      <ConviveShell slug={slug} fontFamily="Inter">
        <p data-testid="child">page</p>
      </ConviveShell>,
    );
  }

  it('renders the convive shell (single main + nav + cart) on a customer route', () => {
    mockPathname = '/sites/lepicurien/menu';
    const { container } = renderShell('lepicurien');

    expect(container.querySelector('.tenant-client')).not.toBeNull();
    expect(container.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    expect(screen.getByTestId('floating-cart')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('skips the convive shell on the tenant admin dashboard', () => {
    mockPathname = '/sites/lepicurien/admin/orders';
    const { container } = renderShell('lepicurien');

    expect(container.querySelector('.tenant-client')).toBeNull();
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('floating-cart')).not.toBeInTheDocument();
    // children still render (the admin layout brings its own shell)
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('keeps the convive shell for a tenant whose slug starts with "admin" (regression)', () => {
    // Bug: pathname.includes('/admin') matched "/sites/admin-bar/menu" and
    // wrongly stripped the shell. The fix anchors the check to the slug.
    mockPathname = '/sites/admin-bar/menu';
    const { container } = renderShell('admin-bar');

    expect(container.querySelector('.tenant-client')).not.toBeNull();
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('still skips the shell on the admin route of an "admin"-prefixed slug', () => {
    mockPathname = '/sites/admin-bar/admin';
    const { container } = renderShell('admin-bar');

    expect(container.querySelector('.tenant-client')).toBeNull();
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument();
  });
});
