import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHeaders } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  orderLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...(args as [])) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

const mockValidateTenant = vi.fn<() => Promise<{ id: string }>>();
const mockPreviewOrderItems = vi.fn<
  () => Promise<{
    valid: boolean;
    issues: Array<{ itemId: string; message: string; removeFromCart: boolean }>;
    invalidItemIds: string[];
    validatedSubtotal: number;
  }>
>();

vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    validateTenant: mockValidateTenant,
    previewOrderItems: mockPreviewOrderItems,
  })),
}));

import { POST } from '../orders/preview/route';

function buildPreviewRequest(body?: unknown): Request {
  return new Request('http://localhost:3000/api/orders/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify(
      body ?? {
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Pizza',
            price: 10,
            quantity: 1,
          },
        ],
      },
    ),
  });
}

describe('POST /api/orders/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers({ 'x-tenant-slug': 'demo' }));
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockValidateTenant.mockResolvedValue({ id: 'tenant-1' });
    mockPreviewOrderItems.mockResolvedValue({
      valid: true,
      issues: [],
      invalidItemIds: [],
      validatedSubtotal: 10,
    });
  });

  it('returns 400 when tenant slug is missing', async () => {
    mockHeaders.mockResolvedValue(new Headers());
    const res = await POST(buildPreviewRequest());
    expect(res.status).toBe(400);
  });

  it('returns preview payload when cart is valid', async () => {
    const res = await POST(buildPreviewRequest());
    const json = (await res.json()) as {
      valid: boolean;
      validatedSubtotal: number;
    };

    expect(res.status).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.validatedSubtotal).toBe(10);
    expect(mockPreviewOrderItems).toHaveBeenCalledWith('tenant-1', expect.any(Array));
  });

  it('returns issues when preview finds stale items', async () => {
    mockPreviewOrderItems.mockResolvedValue({
      valid: false,
      issues: [
        {
          itemId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Article non trouve',
          removeFromCart: true,
        },
      ],
      invalidItemIds: ['550e8400-e29b-41d4-a716-446655440000'],
      validatedSubtotal: 0,
    });

    const res = await POST(buildPreviewRequest());
    const json = (await res.json()) as {
      valid: boolean;
      invalidItemIds: string[];
    };

    expect(res.status).toBe(200);
    expect(json.valid).toBe(false);
    expect(json.invalidItemIds).toHaveLength(1);
  });
});
