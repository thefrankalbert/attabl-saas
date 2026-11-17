// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeleteAccountSection from '../DeleteAccountSection';

const ownerAction = vi.fn();
const staffAction = vi.fn();

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/app/actions/account-deletion', () => ({
  actionDeleteOwnerAccount: (input: unknown) => ownerAction(input),
  actionDeleteStaffAccount: (input: unknown) => staffAction(input),
}));

function openAndType(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'openButton' }));
  fireEvent.change(screen.getByLabelText(/confirmLabel/), { target: { value: text } });
}

describe('DeleteAccountSection', () => {
  beforeEach(() => {
    ownerAction.mockReset();
    staffAction.mockReset();
  });

  it('owner: the button stays disabled until the restaurant name is typed', () => {
    render(<DeleteAccountSection variant="owner" restaurantName="Chez Awa" />);
    openAndType('Chez');
    expect(screen.getByRole('button', { name: 'owner_confirmButton' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/confirmLabel/), { target: { value: ' chez awa ' } });
    expect(screen.getByRole('button', { name: 'owner_confirmButton' })).toBeEnabled();
  });

  it('staff: confirms with the translated word (no e-mail needed), never the owner action', async () => {
    staffAction.mockResolvedValue({ success: false, error: 'ownerMustClose' });
    render(<DeleteAccountSection variant="staff" />);
    openAndType('staff_confirmWord');
    fireEvent.click(screen.getByRole('button', { name: 'staff_confirmButton' }));
    await waitFor(() => expect(screen.getByText('error_ownerMustClose')).toBeInTheDocument());
    expect(staffAction).toHaveBeenCalledWith({ confirmation: 'staff_confirmWord' });
    expect(ownerAction).not.toHaveBeenCalled();
  });

  it('success: no error, the button stays busy while the server redirects', async () => {
    // L'action redirige elle-meme vers /login?deleted=true et ne rend rien.
    staffAction.mockResolvedValue(undefined);
    render(<DeleteAccountSection variant="staff" />);
    openAndType('staff_confirmWord');
    fireEvent.click(screen.getByRole('button', { name: 'staff_confirmButton' }));
    await waitFor(() => expect(staffAction).toHaveBeenCalled());
    expect(screen.queryByText(/^error_/)).toBeNull();
    expect(screen.getByRole('button', { name: 'inProgress' })).toBeDisabled();
  });
});
