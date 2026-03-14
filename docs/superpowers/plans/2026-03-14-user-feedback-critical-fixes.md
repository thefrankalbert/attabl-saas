# User Feedback Critical Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 user-reported critical issues: item creation data loss, email verification deadlock, and password reset security bypass.

**Architecture:** Sprint 1 fixes the item form state management and the resend-confirmation API. Sprint 2 hardens the auth flow (middleware email_confirmed_at check, password reset guard, same-password error). Each task is a self-contained commit that can be deployed independently.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth Admin SDK, TypeScript strict mode, Vitest

---

## Chunk 1: Item Creation — Data Loss Fix (P1)

### Task 1: Fix `setSaving` freeze on plan-limit early return

**Files:**

- Modify: `src/components/admin/ItemsClient.tsx:201-207`
- Test: `src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the handleSubmit logic by extracting the early-return bug scenario.
// Since ItemsClient is a large component, we test the specific bug path:
// when actionCheckCanAddMenuItem returns an error, setSaving must be reset.

describe('ItemsClient handleSubmit - plan limit check', () => {
  it('should reset saving state when plan limit check fails', async () => {
    // This is a regression test for the bug where setSaving(true) was never
    // reset to false when actionCheckCanAddMenuItem returned an error.
    // The fix is verified by reading the source code directly.
    // We verify the pattern: every `return` inside the try block must be
    // preceded by `setSaving(false)` OR the return must be inside a finally block.

    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/components/admin/ItemsClient.tsx', 'utf-8'),
    );

    // Find the handleSubmit function and check that the limitCheck early return
    // includes setSaving(false) before the return statement.
    const limitCheckBlock = source.match(/if\s*\(limitCheck\.error\)\s*\{[\s\S]*?\}/);
    expect(limitCheckBlock).not.toBeNull();
    expect(limitCheckBlock![0]).toContain('setSaving(false)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`
Expected: FAIL — the current code does NOT contain `setSaving(false)` before the early return.

- [ ] **Step 3: Fix the early return in ItemsClient.tsx**

In `src/components/admin/ItemsClient.tsx`, change lines 204-207 from:

```typescript
if (limitCheck.error) {
  toast({ title: limitCheck.error, variant: 'destructive' });
  return;
}
```

To:

```typescript
if (limitCheck.error) {
  toast({ title: limitCheck.error, variant: 'destructive' });
  setSaving(false);
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(items): reset saving state on plan-limit early return"
```

---

### Task 2: Fix modal close not resetting form state

**Files:**

- Modify: `src/components/admin/ItemsClient.tsx:683, 923`

- [ ] **Step 1: Write the regression test**

Append to `src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`:

```typescript
describe('ItemsClient modal close - form reset', () => {
  it('should call resetForm when modal is closed via onClose', async () => {
    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/components/admin/ItemsClient.tsx', 'utf-8'),
    );

    // The AdminModal onClose handler must include resetForm()
    // Pattern: onClose={() => { setShowModal(false); resetForm(); }}
    // or onClose callback that calls resetForm
    const onCloseMatches = source.match(/onClose=\{[^}]*\}/g);
    expect(onCloseMatches).not.toBeNull();

    // At least one onClose should contain resetForm
    const hasResetInOnClose = onCloseMatches!.some((m) => m.includes('resetForm'));
    expect(hasResetInOnClose).toBe(true);
  });

  it('should call resetForm when Cancel button is clicked', async () => {
    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/components/admin/ItemsClient.tsx', 'utf-8'),
    );

    // Find the Cancel button area and verify resetForm is called
    // The Cancel button onClick must include resetForm
    const cancelSection = source.match(
      /cancel[\s\S]{0,200}onClick=\{[^}]*setShowModal\(false\)[^}]*\}/i,
    );
    expect(cancelSection).not.toBeNull();
    expect(cancelSection![0]).toContain('resetForm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`
Expected: FAIL — current onClose and Cancel do not call resetForm().

- [ ] **Step 3: Fix modal close in ItemsClient.tsx**

In `src/components/admin/ItemsClient.tsx`, change line 683 from:

```typescript
          onClose={() => setShowModal(false)}
```

To:

```typescript
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
```

And change line 923 from:

```typescript
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
```

To:

```typescript
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/admin/__tests__/ItemsClient.handleSubmit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(items): reset form state when modal is closed or cancelled"
```

---

### Task 3: Add image format whitelist to ImageUpload

**Files:**

- Modify: `src/components/shared/ImageUpload.tsx:34-38, 144`

- [ ] **Step 1: Add format whitelist and restrict accept attribute**

In `src/components/shared/ImageUpload.tsx`, change lines 34-38 from:

```typescript
// Validation du type
if (!file.type.startsWith('image/')) {
  setError('Le fichier doit être une image');
  return;
}
```

To:

```typescript
// Validation du type — only allow safe, web-optimized formats
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
if (!ALLOWED_TYPES.includes(file.type)) {
  setError('Format non supporté. Utilisez JPG, PNG ou WebP.');
  return;
}
```

And change line 144 from:

```typescript
accept = 'image/*';
```

To:

```typescript
accept = 'image/jpeg,image/png,image/webp';
```

- [ ] **Step 2: Run full test suite to verify no regressions**

Run: `pnpm vitest run`
Expected: All 427+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(upload): restrict image formats to JPG, PNG, WebP"
```

---

## Chunk 2: Email Verification Deadlock Fix (P2)

### Task 4: Fix resend-confirmation API — use correct link type & surface errors

**Files:**

- Modify: `src/app/api/resend-confirmation/route.ts`
- Test: `src/app/api/__tests__/resend-confirmation.test.ts` (create)

- [ ] **Step 1: Write failing tests for the resend-confirmation route**

Create `src/app/api/__tests__/resend-confirmation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockCheck = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/rate-limit', () => ({
  resendConfirmationLimiter: { check: (...args: unknown[]) => mockCheck(...args) },
  getClientIp: () => '127.0.0.1',
}));

const mockGenerateLink = vi.fn();
const mockGetUserByEmail = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: mockGenerateLink,
        getUserByEmail: mockGetUserByEmail,
      },
    },
  }),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/email.service', () => ({
  sendWelcomeConfirmationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/resend-confirmation/route';

function makeRequest(body: object) {
  return new Request('http://localhost/api/resend-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/resend-confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use getUserByEmail instead of listUsers', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: { id: '1', email: 'test@test.com', email_confirmed_at: null } },
    });
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'abc123' } },
    });

    await POST(makeRequest({ email: 'test@test.com' }));

    expect(mockGetUserByEmail).toHaveBeenCalledWith('test@test.com');
  });

  it('should return 500 when generateLink fails (not silent success)', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: { id: '1', email: 'test@test.com', email_confirmed_at: null } },
    });
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: 'Token generation failed' },
    });

    const response = await POST(makeRequest({ email: 'test@test.com' }));
    const json = await response.json();

    // Should NOT return success: true when link generation fails
    expect(json.success).not.toBe(true);
    expect(response.status).toBe(500);
  });

  it('should send email when link generation succeeds', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: { id: '1', email: 'test@test.com', email_confirmed_at: null } },
    });
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'abc123' } },
    });

    const response = await POST(makeRequest({ email: 'test@test.com' }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it('should return success for unknown emails (prevent enumeration)', async () => {
    mockGetUserByEmail.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ email: 'unknown@test.com' }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should return success for already-confirmed users', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: {
        user: { id: '1', email: 'test@test.com', email_confirmed_at: '2026-01-01' },
      },
    });

    const response = await POST(makeRequest({ email: 'test@test.com' }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('should return 429 when rate limited', async () => {
    mockCheck.mockResolvedValueOnce({ success: false });

    const response = await POST(makeRequest({ email: 'test@test.com' }));
    expect(response.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/api/__tests__/resend-confirmation.test.ts`
Expected: FAIL — current code uses `listUsers` (not `getUserByEmail`) and returns `success: true` on generateLink failure.

- [ ] **Step 3: Rewrite the resend-confirmation route**

Replace `src/app/api/resend-confirmation/route.ts` entirely:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { resendConfirmationSchema } from '@/lib/validations/auth.schema';
import { resendConfirmationLimiter, getClientIp } from '@/lib/rate-limit';
import { sendWelcomeConfirmationEmail } from '@/services/email.service';

/**
 * POST /api/resend-confirmation
 *
 * Re-sends the confirmation email for an unconfirmed account.
 * Rate-limited to 3 requests per 10 minutes per IP.
 *
 * Returns success for unknown/confirmed emails (prevent enumeration).
 * Returns 500 if link generation actually fails (so the client can show an error).
 */
export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await resendConfirmationLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': '120' } },
      );
    }

    // 2. Parse and validate
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = resendConfirmationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const { email } = parseResult.data;
    const supabase = createAdminClient();

    const SAFE_MSG =
      'Si un compte existe avec cet email, un nouveau lien de confirmation a ete envoye.';

    // 3. Find user by email (O(1) lookup, not listUsers)
    const { data: userData } = await supabase.auth.admin.getUserByEmail(email);

    if (!userData?.user) {
      logger.info('Resend confirmation requested for unknown email', { email });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // Already confirmed — no need to resend
    if (userData.user.email_confirmed_at) {
      logger.info('Resend confirmation requested for already-confirmed email', { email });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // 4. Generate a fresh confirmation link (type: 'magiclink' avoids the
    //    password-mismatch issue that occurs with type: 'signup' + empty password)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      logger.error('Failed to generate confirmation link for resend', { error: linkError });
      return NextResponse.json(
        { error: 'Impossible de generer le lien de confirmation. Reessayez plus tard.' },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
    const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup`;

    await sendWelcomeConfirmationEmail(email, { confirmationUrl });

    return NextResponse.json({ success: true, message: SAFE_MSG });
  } catch (error) {
    logger.error('Resend confirmation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/app/api/__tests__/resend-confirmation.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(auth): rewrite resend-confirmation — getUserByEmail, surface errors, fix link type"
```

---

### Task 5: Add resend button to login page for "Email not confirmed" errors

**Files:**

- Modify: `src/components/auth/AuthForm.tsx:143-146, 373-382`

- [ ] **Step 1: Add resend link in the "Email not confirmed" error branch**

In `src/components/auth/AuthForm.tsx`, change lines 143-146 from:

```typescript
      } else if (errorMessage.includes('Email not confirmed')) {
        setError(
          'Votre adresse email n\u2019a pas encore ete confirmee. Verifiez votre boite mail et cliquez sur le lien de confirmation.',
        );
```

To:

```typescript
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('email_not_confirmed');
```

Then change the error display block (lines 373-382) from:

```typescript
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
```

To:

```typescript
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
            >
              <AlertDescription className="text-sm">
                {error === 'email_not_confirmed' ? (
                  <span>
                    Votre adresse email n&apos;a pas encore ete confirmee.{' '}
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="font-bold underline hover:no-underline"
                    >
                      {resending ? 'Envoi...' : 'Renvoyer le lien'}
                    </button>
                  </span>
                ) : (
                  error
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass. Then run `pnpm typecheck` to verify types.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(auth): add resend link in login error for unconfirmed emails"
```

---

### Task 6: Fix expired link redirect — point to resend instead of login

**Files:**

- Modify: `src/app/auth/confirm/route.ts:37-44`

- [ ] **Step 1: Change expired link redirect to include resend params**

In `src/app/auth/confirm/route.ts`, change lines 37-44 from:

```typescript
const isExpired = error.message.includes('expired') || error.message.includes('invalid');
const errorMessage = isExpired
  ? 'Le lien de confirmation a expire. Veuillez vous reconnecter pour recevoir un nouveau lien.'
  : 'Erreur lors de la confirmation. Veuillez reessayer.';

return NextResponse.redirect(
  `${requestUrl.origin}/login?error=${encodeURIComponent(errorMessage)}`,
);
```

To:

```typescript
const isExpired = error.message.includes('expired') || error.message.includes('invalid');
const errorMessage = isExpired
  ? 'Le lien de confirmation a expire. Cliquez sur "Renvoyer le lien" ci-dessous.'
  : 'Erreur lors de la confirmation. Veuillez reessayer.';

return NextResponse.redirect(
  `${requestUrl.origin}/login?error=${encodeURIComponent(errorMessage)}`,
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(auth): improve expired confirmation link message"
```

---

### Task 7: Add cooldown UI on resend button

**Files:**

- Modify: `src/components/auth/AuthForm.tsx`

- [ ] **Step 1: Add cooldown state and timer**

In `src/components/auth/AuthForm.tsx`, add a cooldown state near line 54:

```typescript
const [resendCooldown, setResendCooldown] = useState(0);
```

Then modify `handleResendConfirmation` (lines 157-175) to add cooldown:

```typescript
const handleResendConfirmation = useCallback(async () => {
  if (resending || !email || resendCooldown > 0) return;
  setResending(true);
  try {
    const response = await fetch('/api/resend-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Erreur lors de l'envoi");
    }
    // Start 60s cooldown
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  } catch (err) {
    logger.error('Failed to resend confirmation', err);
  } finally {
    setResending(false);
  }
}, [email, resending, resendCooldown]);
```

Then update the resend button in the `confirmationSent` screen (line 213) to show cooldown:

```typescript
              disabled={resending || resendCooldown > 0}
```

And update the button text (lines 216-225):

```typescript
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi en cours...
                </>
              ) : resendCooldown > 0 ? (
                <>Renvoyer dans {resendCooldown}s</>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Renvoyer l&apos;email de confirmation
                </>
              )}
```

- [ ] **Step 2: Run full test suite and typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(auth): add 60s cooldown on resend confirmation button"
```

---

## Chunk 3: Password Reset Security Hardening (P3)

### Task 8: Add email_confirmed_at guard to middleware

**Files:**

- Modify: `src/proxy.ts:119-141`

- [ ] **Step 1: Add email verification check after auth check**

In `src/proxy.ts`, after line 127 (`const { data: { user } } = await supabase.auth.getUser();`), change the block at lines 128-140 from:

```typescript
if (!user && !devBypass) {
  const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const loginUrl = new URL('/login', mainDomain);
  loginUrl.searchParams.set('redirect', pathname);
  const redirectResponse = NextResponse.redirect(loginUrl);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  return redirectResponse;
}
```

To:

```typescript
if (!user && !devBypass) {
  const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const loginUrl = new URL('/login', mainDomain);
  loginUrl.searchParams.set('redirect', pathname);
  const redirectResponse = NextResponse.redirect(loginUrl);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  return redirectResponse;
}

// Block users whose email is not yet confirmed (prevents password-reset bypass)
// Allow /reset-password and /auth/* paths so the reset flow itself still works
if (
  user &&
  !devBypass &&
  !user.email_confirmed_at &&
  !pathname.startsWith('/reset-password') &&
  !pathname.startsWith('/auth/')
) {
  const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const loginUrl = new URL('/login', mainDomain);
  loginUrl.searchParams.set(
    'error',
    'Votre email n\u2019a pas encore ete confirme. Verifiez votre boite mail.',
  );
  const redirectResponse = NextResponse.redirect(loginUrl);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  return redirectResponse;
}
```

- [ ] **Step 2: Run typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(security): block unverified-email users in middleware"
```

---

### Task 9: Guard forgot-password — redirect unconfirmed users to confirmation flow

**Files:**

- Modify: `src/app/api/forgot-password/route.ts:49-64`

- [ ] **Step 1: Add email_confirmed_at check before generating recovery link**

In `src/app/api/forgot-password/route.ts`, after line 50 (`const supabase = createAdminClient();`), insert a user lookup before the generateLink call. Replace lines 52-64:

```typescript
const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email,
});

if (linkError || !linkData?.properties?.hashed_token) {
  logger.info('Forgot password: generateLink failed or user not found', {
    email,
    error: linkError?.message,
  });
  return successResponse;
}
```

With:

```typescript
// Check if the user exists and whether their email is confirmed
const { data: userData } = await supabase.auth.admin.getUserByEmail(email);

if (!userData?.user) {
  logger.info('Forgot password: user not found', { email });
  return successResponse;
}

// If email is NOT confirmed, send a confirmation link instead of a recovery link.
// This prevents the password-reset flow from being used to bypass email verification.
if (!userData.user.email_confirmed_at) {
  logger.info('Forgot password: email not confirmed, sending confirmation instead', {
    email,
  });

  const { data: confirmLinkData, error: confirmError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (!confirmError && confirmLinkData?.properties?.hashed_token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
    const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${confirmLinkData.properties.hashed_token}&type=signup`;

    const { sendWelcomeConfirmationEmail } = await import('@/services/email.service');
    await sendWelcomeConfirmationEmail(email, { confirmationUrl });
  }

  return successResponse;
}

const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email,
});

if (linkError || !linkData?.properties?.hashed_token) {
  logger.info('Forgot password: generateLink failed', {
    email,
    error: linkError?.message,
  });
  return successResponse;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(security): forgot-password sends confirmation link for unverified emails"
```

---

### Task 10: Protect /reset-password — require PASSWORD_RECOVERY event

**Files:**

- Modify: `src/app/reset-password/page.tsx:35-40`

- [ ] **Step 1: Remove the permissive getSession fallback**

In `src/app/reset-password/page.tsx`, change lines 35-40 from:

```typescript
// Also check if we already have a session (user came via redirect)
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    setSessionReady(true);
  }
});
```

To:

```typescript
// Check if we already have an active recovery session.
// Only mark ready if the user already triggered PASSWORD_RECOVERY
// (the event may have fired before useEffect mounted).
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user?.recovery_sent_at) {
    // recovery_sent_at is set by Supabase when a recovery OTP was verified
    setSessionReady(true);
  }
});
```

> **Note:** This tightens access so that navigating directly to `/reset-password` with a normal session no longer shows the form. The `PASSWORD_RECOVERY` event from `onAuthStateChange` remains the primary gate.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(security): restrict /reset-password to PASSWORD_RECOVERY sessions"
```

---

### Task 11: Fix same-password error detection

**Files:**

- Modify: `src/app/reset-password/page.tsx:67`

- [ ] **Step 1: Improve error detection**

In `src/app/reset-password/page.tsx`, change lines 65-71 from:

```typescript
if (updateError) {
  logger.error('Password update failed', { error: updateError.message });
  if (updateError.message.includes('same')) {
    setError("Le nouveau mot de passe doit etre different de l'ancien.");
  } else {
    setError('Erreur lors de la mise a jour du mot de passe. Veuillez reessayer.');
  }
}
```

To:

```typescript
if (updateError) {
  logger.error('Password update failed', {
    error: updateError.message,
    code: (updateError as { code?: string }).code,
  });
  const code = (updateError as { code?: string }).code;
  const msg = updateError.message?.toLowerCase() ?? '';
  if (code === 'same_password' || msg.includes('same') || msg.includes('different')) {
    setError('Le nouveau mot de passe doit etre different de l\u2019ancien.');
  } else {
    setError('Erreur lors de la mise a jour du mot de passe. Veuillez reessayer.');
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(auth): robust same-password detection using error code + message"
```

---

## Final Validation

### Task 12: Full CI validation

- [ ] **Step 1: Run the complete CI pipeline locally**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run && pnpm build
```

Expected: All 5 gates pass.

- [ ] **Step 2: Fix any issues found**

If lint/format issues appear, run `pnpm lint --fix && pnpm format` then re-run the pipeline.

- [ ] **Step 3: Final commit if any formatting changes**

```bash
git add -A
git commit -m "chore: lint + format fixes"
```

---

## Summary of All Commits

| #   | Commit message                                                                           | Fixes        |
| --- | ---------------------------------------------------------------------------------------- | ------------ |
| 1   | `fix(items): reset saving state on plan-limit early return`                              | P1 Bug 1     |
| 2   | `fix(items): reset form state when modal is closed or cancelled`                         | P1 Bug 2     |
| 3   | `fix(upload): restrict image formats to JPG, PNG, WebP`                                  | P1 Bug 7     |
| 4   | `fix(auth): rewrite resend-confirmation — getUserByEmail, surface errors, fix link type` | P2 Bugs 1, 3 |
| 5   | `fix(auth): add resend link in login error for unconfirmed emails`                       | P2 Bugs 2, 4 |
| 6   | `fix(auth): improve expired confirmation link message`                                   | P2 Bug 5     |
| 7   | `fix(auth): add 60s cooldown on resend confirmation button`                              | P2 Bug 7     |
| 8   | `fix(security): block unverified-email users in middleware`                              | P3 Bugs 1, 3 |
| 9   | `fix(security): forgot-password sends confirmation link for unverified emails`           | P3 Bug 5     |
| 10  | `fix(security): restrict /reset-password to PASSWORD_RECOVERY sessions`                  | P3 Bug 4     |
| 11  | `fix(auth): robust same-password detection using error code + message`                   | P3 Bug 2     |
