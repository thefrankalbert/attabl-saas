import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F1 - integrite financiere.
 *
 * Cette route cree un tenant. Avant correction, elle se contentait de verifier
 * qu'une session existait, et lisait `plan` DANS LE CORPS de la requete.
 * N'importe quel compte connecte - y compris un serveur embauche pour une soiree -
 * pouvait donc s'attribuer un tenant Business gratuit a vie.
 *
 * Ces tests verrouillent les deux garanties. Sans eux, retirer l'une ou l'autre
 * ne casserait rien de visible: la route continuerait de repondre 200.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockLimit = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  restaurantCreateLimiter: { check: () => mockLimit() },
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));

// Resultat du lookup de propriete (null = l'appelant n'est pas owner actif).
let ownershipRow: { tenant_id: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve({ data: ownershipRow }) }),
              }),
            }),
          }),
        }),
      }),
    }),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

vi.mock('@/services/slug.service', () => ({
  createSlugService: () => ({ generateUniqueSlug: (s: string) => Promise.resolve(s) }),
}));

// Capture ce que la route transmet reellement au service. Le parametre est TYPE:
// c'est lui qu'on inspecte pour prouver que le plan du client est ignore.
interface AddRestaurantInput {
  plan: string;
  name: string;
  slug: string;
}
const addRestaurant =
  vi.fn<(input: AddRestaurantInput) => Promise<{ tenantId: string; slug: string }>>();
vi.mock('@/services/restaurant-group.service', () => ({
  createRestaurantGroupService: () => ({
    getOrCreateGroup: () => Promise.resolve({ id: 'g1' }),
    addRestaurantToGroup: (input: AddRestaurantInput) => addRestaurant(input),
  }),
}));

function post(body: unknown): Request {
  return new Request('https://attabl.com/api/restaurants/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID = { name: 'Chez Fatou', type: 'restaurant', slug: 'chez-fatou', plan: 'business' };

describe('POST /api/restaurants/create (F1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({ success: true });
    addRestaurant.mockResolvedValue({ tenantId: 't-new', slug: 'nouveau-resto' });
    ownershipRow = { tenant_id: 't1' };
  });

  it('REFUSE un compte connecte qui n est pas proprietaire actif', async () => {
    // Le scenario commercial: un employe cree son propre tenant Business.
    ownershipRow = null;
    const { POST } = await import('@/app/api/restaurants/create/route');

    const res = await POST(post(VALID));

    expect(res.status).toBe(403);
    // Rien ne doit avoir ete cree.
    expect(addRestaurant).not.toHaveBeenCalled();
  });

  it('IGNORE le plan envoye par le client et force un essai', async () => {
    // Meme un proprietaire legitime ne choisit pas son plan par l API: un plan
    // payant ne s obtient que par un paiement Stripe abouti.
    const { POST } = await import('@/app/api/restaurants/create/route');

    const res = await POST(post({ ...VALID, plan: 'business' }));

    expect(res.status).toBe(200);
    expect(addRestaurant).toHaveBeenCalledTimes(1);
    const sent = addRestaurant.mock.calls[0][0];
    expect(sent.plan).toBe('trial');
    expect(sent.plan).not.toBe('business');
  });

  it('force l essai meme quand le client demande explicitement starter', async () => {
    const { POST } = await import('@/app/api/restaurants/create/route');

    await POST(post({ ...VALID, plan: 'starter' }));

    const sent = addRestaurant.mock.calls[0][0];
    expect(sent.plan).toBe('trial');
  });

  it('laisse passer un proprietaire actif', async () => {
    const { POST } = await import('@/app/api/restaurants/create/route');

    const res = await POST(post(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.slug).toBe('nouveau-resto');
  });
});
