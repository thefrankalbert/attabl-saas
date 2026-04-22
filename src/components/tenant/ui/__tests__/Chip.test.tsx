// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders default variant', () => {
    render(<Chip>Entrees</Chip>);
    const el = screen.getByRole('button', { name: 'Entrees' });
    expect(el.getAttribute('data-variant')).toBe('default');
  });

  it('renders active variant', () => {
    render(<Chip variant="active">Plats</Chip>);
    const el = screen.getByRole('button', { name: 'Plats' });
    expect(el.getAttribute('data-variant')).toBe('active');
  });

  it('fires onClick when tapped', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Desserts</Chip>);
    fireEvent.click(screen.getByRole('button', { name: 'Desserts' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
