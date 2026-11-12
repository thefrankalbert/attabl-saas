// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Tabs } from '@/components/ui/tabs';
import SettingsIdentity from '../SettingsIdentity';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-FR',
  useTranslations: () => (k: string) => k,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../SettingsEstablishmentDetails', () => ({ default: () => null }));
vi.mock('@/components/shared/ImageUpload', () => ({ default: () => null }));

const t = (k: string) => k;

function Harness({ customDomain }: { customDomain?: string | null }) {
  const form = useForm<SettingsFormValues>({
    defaultValues: { name: 'Chez Awa' } as SettingsFormValues,
  });
  return (
    <Tabs value="identity">
      <SettingsIdentity
        form={form}
        tenant={{ slug: 'chezawa', custom_domain: customDomain ?? null }}
        logoPreview={null}
        saving={false}
        t={t}
      />
    </Tabs>
  );
}

describe('SettingsIdentity - custom domain is a request (C-083)', () => {
  it('offers to REQUEST the typed domain, with the current address, and no save button', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('domainPlaceholder');
    fireEvent.change(input, { target: { value: 'menu.chezawa.com' } });

    const link = screen.getByRole('link', { name: /domainRequest/ });
    const href = decodeURIComponent(link.getAttribute('href') ?? '');
    expect(href.startsWith('mailto:support@attabl.com')).toBe(true);
    expect(href).toContain('chezawa.attabl.com -> menu.chezawa.com');
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remove' })).not.toBeInTheDocument();
  });

  it('asks nothing when the domain typed is already the active one', () => {
    render(<Harness customDomain="menu.chezawa.com" />);
    expect(screen.queryByRole('link', { name: /domainRequest/ })).not.toBeInTheDocument();
  });
});
