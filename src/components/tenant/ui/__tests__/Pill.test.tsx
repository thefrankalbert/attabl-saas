// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Pill } from '../Pill';

describe('Pill', () => {
  it('renders default variant', () => {
    render(<Pill>Standard</Pill>);
    const el = screen.getByText('Standard');
    expect(el.getAttribute('data-variant')).toBe('default');
  });

  it('renders lock variant with cadenas icon', () => {
    render(<Pill variant="lock">Verrouillee</Pill>);
    const el = screen.getByText('Verrouillee');
    expect(el.getAttribute('data-variant')).toBe('lock');
    // lucide icons render as <svg> inside the pill
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('accepts a custom icon override', () => {
    render(
      <Pill icon={<span data-testid="custom-icon" />} variant="success">
        Pret
      </Pill>,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
