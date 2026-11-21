// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { SupportContactCard } from '../SupportContactCard';
import { SupportGuides } from '../SupportGuides';
import { SupportFAQ } from '../SupportFAQ';
import { supportWhatsAppLink, toSupportContact } from '@/lib/support-contact';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

describe('SupportContactCard', () => {
  it("sans numero enregistre: ni WhatsApp ni appel, l'e-mail reste propose", () => {
    render(<SupportContactCard contact={null} whatsappHref={null} phoneHref={null} />, {
      wrapper,
    });
    expect(screen.queryByText('Écrire sur WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('Copier le numéro')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Écrire un e-mail' })).toHaveAttribute(
      'href',
      'mailto:support@attabl.com',
    );
  });

  it('avec un numero: lien WhatsApp vers ce numero, et numero copiable', async () => {
    const contact = toSupportContact('+226 70 11 22 33');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <SupportContactCard
        contact={contact}
        whatsappHref={supportWhatsAppLink(contact, 'Bonjour')}
        phoneHref="tel:+22670112233"
      />,
      { wrapper },
    );
    expect(screen.getByRole('link', { name: 'Écrire sur WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/22670112233?text=Bonjour',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copier le numéro' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('+226 70 11 22 33'));
  });
});

describe('SupportGuides', () => {
  it("chaque guide mene a sa vraie page de l'administration", () => {
    render(<SupportGuides basePath="/sites/demo/admin" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Créer votre carte' }));
    const region = screen.getByRole('region');
    expect(within(region).getAllByRole('listitem')).toHaveLength(5);
    expect(within(region).getByRole('link', { name: 'Ouvrir Cartes & Menus' })).toHaveAttribute(
      'href',
      '/sites/demo/admin/menus',
    );
  });
});

describe('SupportFAQ', () => {
  it('affiche les questions traduites', () => {
    render(<SupportFAQ />, { wrapper });
    expect(screen.getByText("Comment changer le prix d'un plat ?")).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
