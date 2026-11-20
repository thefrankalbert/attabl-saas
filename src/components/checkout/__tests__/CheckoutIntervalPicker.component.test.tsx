// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { CheckoutIntervalPicker } from '../CheckoutIntervalPicker';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

describe('CheckoutIntervalPicker', () => {
  it("passe a l'annuel au clic, et ne relance rien sur la periode deja choisie", () => {
    const onChange = vi.fn();
    render(<CheckoutIntervalPicker plan="pro" value="monthly" onChange={onChange} />, {
      wrapper,
    });
    fireEvent.click(screen.getByRole('radio', { name: /Mensuel/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Annuel/ }));
    expect(onChange).toHaveBeenCalledWith('yearly');
    expect(screen.getByText(/^67\s000 F \/ mois$/)).toBeInTheDocument();
    expect(screen.getByText('-15 %')).toBeInTheDocument();
  });
});
