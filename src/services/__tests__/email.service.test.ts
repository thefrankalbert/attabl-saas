import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Logger is noisy + irrelevant to behaviour under test.
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createEmailService } from '../email.service';

describe('EmailService - delivery reporting', () => {
  const ORIGINAL_KEY = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = ORIGINAL_KEY;
    }
  });

  it('reports failure (NOT silent success) when RESEND_API_KEY is missing', async () => {
    // Regression guard: previously send() returned { success: true } when the
    // provider was unconfigured, so signup told users to check an inbox that
    // never received anything. It must now report success:false instead.
    delete process.env.RESEND_API_KEY;

    const svc = createEmailService();
    const result = await svc.sendWelcomeEmail('owner@test.com', {
      confirmationUrl: 'https://attabl.com/auth/confirm?token_hash=abc&type=signup',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('EMAIL_NOT_CONFIGURED');
  });
});
