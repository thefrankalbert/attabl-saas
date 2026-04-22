// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TenantButton } from '../TenantButton';

describe('TenantButton', () => {
  it('renders primary variant by default with min touch target', () => {
    render(<TenantButton>Commander</TenantButton>);
    const btn = screen.getByRole('button', { name: 'Commander' });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('data-variant')).toBe('primary');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('supports ghost variant', () => {
    render(<TenantButton variant="ghost">Annuler</TenantButton>);
    const btn = screen.getByRole('button', { name: 'Annuler' });
    expect(btn.getAttribute('data-variant')).toBe('ghost');
  });

  it('fires onClick handler', () => {
    const onClick = vi.fn();
    render(<TenantButton onClick={onClick}>Go</TenantButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop set', () => {
    render(<TenantButton disabled>X</TenantButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });
});
