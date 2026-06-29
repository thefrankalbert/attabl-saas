/**
 * Les personas = "l'equipe" cote restaurant + les clients.
 * Chaque persona authentifie obtient son propre APIRequestContext (cookies de
 * session isoles), exactement comme des humains differents connectes en parallele.
 */
import { request, type APIRequestContext } from '@playwright/test';
import { journeyEnv } from './env';

export type RestaurantRole = 'owner' | 'manager' | 'server' | 'kitchen' | 'cashier';

export interface Persona {
  key: string;
  side: 'restaurant' | 'client';
  label: string;
  role?: RestaurantRole;
  email?: string;
  password?: string;
}

const PW = process.env.JOURNEY_DEFAULT_PASSWORD || 'Journey!Test2026';

/** Equipe cote restaurant (rôles de la table admin_users). */
export const RESTAURANT_TEAM: Persona[] = [
  {
    key: 'owner',
    side: 'restaurant',
    role: 'owner',
    label: 'Proprietaire / super_admin',
    email: `owner+${journeyEnv.tenantSlug}@journey.test`,
    password: PW,
  },
  {
    key: 'manager',
    side: 'restaurant',
    role: 'manager',
    label: 'Manager',
    email: `manager+${journeyEnv.tenantSlug}@journey.test`,
    password: PW,
  },
  {
    key: 'server',
    side: 'restaurant',
    role: 'server',
    label: 'Serveur (POS)',
    email: `server+${journeyEnv.tenantSlug}@journey.test`,
    password: PW,
  },
  {
    key: 'kitchen',
    side: 'restaurant',
    role: 'kitchen',
    label: 'Cuisine (KDS)',
    email: `kitchen+${journeyEnv.tenantSlug}@journey.test`,
    password: PW,
  },
  {
    key: 'cashier',
    side: 'restaurant',
    role: 'cashier',
    label: 'Caissier',
    email: `cashier+${journeyEnv.tenantSlug}@journey.test`,
    password: PW,
  },
];

/** Clients (cote convive). Le convive sur place est anonyme (token de table). */
export const CLIENTS: Persona[] = [
  { key: 'diner_qr', side: 'client', label: 'Convive sur place (QR + token)' },
  { key: 'takeaway', side: 'client', label: 'Client a emporter' },
];

export const OWNER = RESTAURANT_TEAM[0];

/** Contexte API anonyme (client non connecte). */
export function newApiContext(
  extraHeaders: Record<string, string> = {},
): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: journeyEnv.baseURL,
    // Origin localhost: les routes POST publiques (orders, coupons, login) passent
    // par verifyOrigin (CSRF) et renvoient 403 sans Origin/Referer autorise. En dev,
    // un Origin localhost est accepte.
    //
    // Referer /sites/<slug>/: le middleware (proxy.ts) SUPPRIME tout x-tenant-slug
    // envoye par le client (anti-spoofing) et derive le tenant du sous-domaine OU,
    // sur le domaine principal, d'un Referer matchant /sites/{slug}/. En local
    // (localhost, pas de sous-domaine), c'est le Referer qui injecte le tenant.
    extraHTTPHeaders: {
      origin: journeyEnv.baseURL,
      referer: `${journeyEnv.baseURL}/sites/${journeyEnv.tenantSlug}/`,
      ...extraHeaders,
    },
  });
}

/**
 * Connecte un persona via /api/login et renvoie son contexte (cookies conserves).
 * En dev (ALLOW_DEV_AUTH_BYPASS=true), Turnstile est desactive: cfToken ignore.
 */
export async function loginPersona(p: Persona): Promise<APIRequestContext> {
  const ctx = await newApiContext();
  if (!p.email) return ctx; // client anonyme: pas de login
  const res = await ctx.post('/api/login', {
    data: { email: p.email, password: p.password, cfToken: 'dev-bypass' },
  });
  if (!res.ok()) {
    throw new Error(`Login persona "${p.key}" echoue: ${res.status()} - ${await res.text()}`);
  }
  return ctx;
}
