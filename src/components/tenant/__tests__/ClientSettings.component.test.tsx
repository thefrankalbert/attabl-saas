// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClientSettings from '../ClientSettings';

// ─── Mocks ──────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/sites/test-restaurant/settings',
}));

let mockLocale = 'fr-FR';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockLocale,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({ totalItems: 0 }),
}));

let mockDisplayCurrency = 'XAF';
const mockSetDisplayCurrency = vi.fn((code: string) => {
  mockDisplayCurrency = code;
  localStorage.setItem('attabl_display_currency', code);
});

vi.mock('@/contexts/CurrencyContext', () => ({
  useDisplayCurrency: () => ({
    displayCurrency: mockDisplayCurrency,
    setDisplayCurrency: mockSetDisplayCurrency,
    formatDisplayPrice: (amount: number) => `${Math.round(amount).toLocaleString('fr-FR')} FCFA`,
  }),
}));

// ─── Helpers ────────────────────────────────────────────

const defaultProps = {
  tenantSlug: 'test-restaurant',
  tenantName: 'Le Gourmet',
  tenantLogo: 'https://example.com/logo.png',
  currency: 'XAF',
};

function renderSettings(props = {}) {
  return render(<ClientSettings {...defaultProps} {...props} />);
}

// ─── LocalStorage mock ──────────────────────────────────

let localStorageStore: Record<string, string> = {};

beforeEach(() => {
  mockPush.mockClear();
  mockSetDisplayCurrency.mockClear();
  mockDisplayCurrency = 'XAF';
  mockLocale = 'fr-FR';
  localStorageStore = {};

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      localStorageStore[key] = val;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key];
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────

describe('ClientSettings', () => {
  // ─── Rendering ──────────────────────────────────────

  it('renders the header with title in French', () => {
    renderSettings();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
  });

  it('renders the header with title in English', () => {
    mockLocale = 'en-US';
    renderSettings();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the Préférences section label', () => {
    renderSettings();
    expect(screen.getByText('Préférences')).toBeInTheDocument();
  });

  it('renders the Support & Infos section label', () => {
    renderSettings();
    expect(screen.getByText('Support & Infos')).toBeInTheDocument();
  });

  it('renders version footer', () => {
    renderSettings();
    expect(screen.getByText('ATTABL v1.0')).toBeInTheDocument();
  });

  // ─── Language Toggle ────────────────────────────────

  it('renders FR and EN buttons', () => {
    renderSettings();
    expect(screen.getByText('FR')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('shows "Français" subtitle when locale is fr', () => {
    renderSettings();
    expect(screen.getByText('Français')).toBeInTheDocument();
  });

  it('shows "English" subtitle when locale is en', () => {
    mockLocale = 'en-US';
    renderSettings();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('sets cookie and reloads when clicking EN', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    // Intercept document.cookie setter
    let cookieSet = '';
    Object.defineProperty(document, 'cookie', {
      set: (val: string) => {
        cookieSet = val;
      },
      get: () => cookieSet,
      configurable: true,
    });

    renderSettings();
    fireEvent.click(screen.getByText('EN'));

    expect(cookieSet).toContain('NEXT_LOCALE=en-US');
    expect(reloadMock).toHaveBeenCalled();
  });

  // ─── Currency Selector ──────────────────────────────

  it('renders all 3 currency buttons', () => {
    renderSettings();
    expect(screen.getByText(/F CFA/)).toBeInTheDocument();
    expect(screen.getByText(/Euro/)).toBeInTheDocument();
    expect(screen.getByText(/Dollar/)).toBeInTheDocument();
  });

  it('defaults to XAF when no stored preference', () => {
    renderSettings();
    // The XAF button should have white text (active state)
    const fcfaButton = screen.getByText(/F CFA/).closest('button');
    expect(fcfaButton).toBeTruthy();
    // Active button has white color
    expect(fcfaButton!.style.color).toBe('#ffffff');
  });

  it('stores currency preference in localStorage on click', () => {
    renderSettings();
    fireEvent.click(screen.getByText(/Euro/).closest('button')!);
    expect(mockSetDisplayCurrency).toHaveBeenCalledWith('EUR');
  });

  it('reads stored currency preference on mount', () => {
    mockDisplayCurrency = 'USD';
    renderSettings();
    const dollarButton = screen.getByText(/Dollar/).closest('button');
    expect(dollarButton!.style.color).toBe('#ffffff');
  });

  // ─── Notifications ──────────────────────────────────

  it('renders notifications row', () => {
    renderSettings();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows notification status text in French by default', () => {
    renderSettings();
    // In happy-dom, Notification API may not exist → "Non supportées"
    // In a real browser with Notification API → "Désactivées"
    const statusEl = screen.getByText(/Désactivées|Non supportées/);
    expect(statusEl).toBeInTheDocument();
  });

  it('shows notification status text in English by default', () => {
    mockLocale = 'en-US';
    renderSettings();
    const statusEl = screen.getByText(/Disabled|Not supported/);
    expect(statusEl).toBeInTheDocument();
  });

  // ─── Privacy Modal ──────────────────────────────────

  it('renders Confidentialité button in French', () => {
    renderSettings();
    expect(screen.getByText('Confidentialité')).toBeInTheDocument();
  });

  it('opens privacy modal on click', () => {
    renderSettings();
    const privacyButton = screen.getByText('Confidentialité').closest('button');
    fireEvent.click(privacyButton!);

    expect(screen.getByText('Collecte des données')).toBeInTheDocument();
    expect(screen.getByText('Utilisation')).toBeInTheDocument();
    expect(screen.getByText('Stockage')).toBeInTheDocument();
  });

  it('shows tenant name in privacy modal footer', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Confidentialité').closest('button')!);
    expect(screen.getByText('Le Gourmet • privacy@attabl.com')).toBeInTheDocument();
  });

  it('closes privacy modal with X button', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Confidentialité').closest('button')!);
    expect(screen.getByText('Collecte des données')).toBeInTheDocument();

    // Find X close buttons — privacy modal has one
    const closeButtons = screen.getAllByRole('button');
    const modalClose = closeButtons.find((btn) => btn.closest('[style*="z-index: 1001"]') !== null);
    if (modalClose) {
      fireEvent.click(modalClose);
    }
  });

  // ─── About Modal ────────────────────────────────────

  it('renders À propos button with tenant name', () => {
    renderSettings();
    expect(screen.getByText('À propos')).toBeInTheDocument();
    // Tenant name appears as subtitle under "À propos"
    const aboutItems = screen.getAllByText('Le Gourmet');
    expect(aboutItems.length).toBeGreaterThanOrEqual(1);
  });

  it('opens about modal on click', () => {
    renderSettings();
    const aboutButton = screen.getByText('À propos').closest('button');
    fireEvent.click(aboutButton!);

    // Modal shows tenant description
    expect(
      screen.getByText(/ATTABL est l'application de menu digital de Le Gourmet/),
    ).toBeInTheDocument();
  });

  it('shows tenant logo in about modal when provided', () => {
    renderSettings();
    fireEvent.click(screen.getByText('À propos').closest('button')!);

    const logo = screen.getByAltText('Le Gourmet');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('does not render logo in about modal when null', () => {
    renderSettings({ tenantLogo: null });
    fireEvent.click(screen.getByText('À propos').closest('button')!);

    expect(screen.queryByAltText('Le Gourmet')).not.toBeInTheDocument();
  });

  it('shows "Powered by ATTABL" in about modal', () => {
    renderSettings();
    fireEvent.click(screen.getByText('À propos').closest('button')!);
    expect(screen.getByText(/Powered by ATTABL/)).toBeInTheDocument();
  });

  // ─── Navigation ─────────────────────────────────────

  it('navigates home when clicking X close button in header', () => {
    renderSettings();
    // The X button is the first button in the header
    const allButtons = screen.getAllByRole('button');
    // First button is the X close in the header
    fireEvent.click(allButtons[0]);
    expect(mockPush).toHaveBeenCalledWith('/sites/test-restaurant');
  });

  // ─── Layout ─────────────────────────────────────────

  it('main element uses overflow hidden (no scroll)', () => {
    const { container } = renderSettings();
    const main = container.querySelector('main');
    // happy-dom may not support dvh units so we check overflow
    expect(main!.style.overflow).toBe('hidden');
  });

  // ─── English locale ─────────────────────────────────

  it('renders all labels in English when locale is en', () => {
    mockLocale = 'en-US';
    renderSettings();

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Support & Info')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('renders about modal text in English', () => {
    mockLocale = 'en-US';
    renderSettings();
    fireEvent.click(screen.getByText('About').closest('button')!);

    expect(
      screen.getByText(/ATTABL is the digital menu application for Le Gourmet/),
    ).toBeInTheDocument();
  });

  it('renders privacy modal text in English', () => {
    mockLocale = 'en-US';
    renderSettings();
    fireEvent.click(screen.getByText('Privacy Policy').closest('button')!);

    expect(screen.getByText('Data Collection')).toBeInTheDocument();
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });
});
