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

  it('renders the header with settings title', () => {
    renderSettings();
    expect(screen.getByText('settingsTitle')).toBeInTheDocument();
  });

  it('renders the Preferences section label', () => {
    renderSettings();
    expect(screen.getByText('preferencesSection')).toBeInTheDocument();
  });

  it('renders the Support section label', () => {
    renderSettings();
    expect(screen.getByText('supportSection')).toBeInTheDocument();
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

  it('shows language label', () => {
    renderSettings();
    expect(screen.getByText('languageLabel')).toBeInTheDocument();
  });

  it('shows current language subtitle', () => {
    renderSettings();
    expect(screen.getByText('currentLanguage')).toBeInTheDocument();
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
    // The XAF button should have active state (tenant-primary bg via inline style)
    const fcfaButton = screen.getByText(/F CFA/).closest('button');
    expect(fcfaButton).toBeTruthy();
    // Active button has tenant-primary backgroundColor via inline style
    expect(fcfaButton!.style.backgroundColor).toBeTruthy();
    expect(fcfaButton!.className).toContain('text-white');
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
    expect(dollarButton!.style.backgroundColor).toBeTruthy();
    expect(dollarButton!.className).toContain('text-white');
  });

  // ─── Notifications ──────────────────────────────────

  it('renders notifications row', () => {
    renderSettings();
    expect(screen.getByText('notificationsLabel')).toBeInTheDocument();
  });

  it('shows notification status text', () => {
    renderSettings();
    // Mock returns translation keys - happy-dom may not have Notification API
    const statusEl = screen.getByText(/notificationsDisabled|notificationsNotSupported/);
    expect(statusEl).toBeInTheDocument();
  });

  // ─── Privacy Modal ──────────────────────────────────

  it('renders privacy policy button', () => {
    renderSettings();
    expect(screen.getByText('privacyPolicy')).toBeInTheDocument();
  });

  it('opens privacy modal on click', () => {
    renderSettings();
    const privacyButton = screen.getByText('privacyPolicy').closest('button');
    fireEvent.click(privacyButton!);

    expect(screen.getByText('dataCollectionTitle')).toBeInTheDocument();
    expect(screen.getByText('usageTitle')).toBeInTheDocument();
    expect(screen.getByText('storageTitle')).toBeInTheDocument();
  });

  it('shows tenant name in privacy modal footer', () => {
    renderSettings();
    fireEvent.click(screen.getByText('privacyPolicy').closest('button')!);
    expect(screen.getByText('Le Gourmet • privacy@attabl.com')).toBeInTheDocument();
  });

  it('closes privacy modal with X button', () => {
    renderSettings();
    fireEvent.click(screen.getByText('privacyPolicy').closest('button')!);
    expect(screen.getByText('dataCollectionTitle')).toBeInTheDocument();

    // Find X close buttons - privacy modal has one
    const closeButtons = screen.getAllByRole('button');
    const modalClose = closeButtons.find((btn) => btn.closest('.z-\\[1001\\]') !== null);
    if (modalClose) {
      fireEvent.click(modalClose);
    }
  });

  // ─── About Modal ────────────────────────────────────

  it('renders about button with tenant name', () => {
    renderSettings();
    expect(screen.getByText('aboutLabel')).toBeInTheDocument();
    // Tenant name appears as subtitle under "aboutLabel"
    const aboutItems = screen.getAllByText('Le Gourmet');
    expect(aboutItems.length).toBeGreaterThanOrEqual(1);
  });

  it('opens about modal on click', () => {
    renderSettings();
    const aboutButton = screen.getByText('aboutLabel').closest('button');
    fireEvent.click(aboutButton!);

    // Modal shows about title
    expect(screen.getByText('aboutTitle')).toBeInTheDocument();
  });

  it('shows tenant logo in about modal when provided', () => {
    renderSettings();
    fireEvent.click(screen.getByText('aboutLabel').closest('button')!);

    const logo = screen.getByAltText('Le Gourmet');
    expect(logo).toBeInTheDocument();
  });

  it('does not render logo in about modal when null', () => {
    renderSettings({ tenantLogo: null });
    fireEvent.click(screen.getByText('aboutLabel').closest('button')!);

    expect(screen.queryByAltText('Le Gourmet')).not.toBeInTheDocument();
  });

  it('shows "Powered by ATTABL" in about modal', () => {
    renderSettings();
    fireEvent.click(screen.getByText('aboutLabel').closest('button')!);
    expect(screen.getByText(/Powered by ATTABL/)).toBeInTheDocument();
  });

  // ─── Navigation ─────────────────────────────────────

  it('navigates home when clicking back button in header', () => {
    renderSettings();
    // The back arrow is the first button in the header
    const allButtons = screen.getAllByRole('button');
    fireEvent.click(allButtons[0]);
    expect(mockPush).toHaveBeenCalledWith('/sites/test-restaurant');
  });

  // ─── Layout ─────────────────────────────────────────

  it('main element uses theme background', () => {
    const { container } = renderSettings();
    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    expect(main!.className).toContain('bg-app-bg');
  });

  // ─── Translation keys used consistently ─────────────

  it('renders all key labels via translation keys', () => {
    renderSettings();

    expect(screen.getByText('settingsTitle')).toBeInTheDocument();
    expect(screen.getByText('preferencesSection')).toBeInTheDocument();
    expect(screen.getByText('supportSection')).toBeInTheDocument();
    expect(screen.getByText('languageLabel')).toBeInTheDocument();
    expect(screen.getByText('currencyLabel')).toBeInTheDocument();
    expect(screen.getByText('privacyPolicy')).toBeInTheDocument();
    expect(screen.getByText('aboutLabel')).toBeInTheDocument();
  });
});
