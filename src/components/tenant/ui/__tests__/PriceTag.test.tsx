// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { PriceTag } from '../PriceTag';

describe('PriceTag', () => {
  it('renders FCFA format with NBSP separator', () => {
    const { container } = render(<PriceTag amount={8500} />);
    const el = container.querySelector('[data-slot="price-tag"]');
    expect(el).not.toBeNull();
    // textContent preserves NBSP - getByText normalizes it to a space.
    expect(el?.textContent).toBe('8\u00A0500\u00A0FCFA');
  });

  it('applies custom className', () => {
    const { container } = render(<PriceTag amount={500} className="custom-class" />);
    const el = container.querySelector('[data-slot="price-tag"]');
    expect(el?.className).toContain('custom-class');
    expect(el?.textContent).toBe('500\u00A0FCFA');
  });
});
