// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { MfaCodeForm } from '../MfaCodeForm';

describe('MfaCodeForm', () => {
  it('keeps only digits and spaces typed or pasted in the code field', () => {
    render(<MfaCodeForm onSubmitCode={vi.fn(async () => null)} submitLabel="ok" />);
    const input = screen.getByLabelText('codeLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc123' } });
    expect(input.value).toBe('123');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('accepts a pasted code with a space and submits it without the space', async () => {
    const onSubmitCode = vi.fn(async () => null);
    render(<MfaCodeForm onSubmitCode={onSubmitCode} submitLabel="ok" />);
    const input = screen.getByLabelText('codeLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123 456' } });
    expect(input.value).toBe('123 456');
    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    await waitFor(() => expect(onSubmitCode).toHaveBeenCalledWith('123456'));
  });
});
