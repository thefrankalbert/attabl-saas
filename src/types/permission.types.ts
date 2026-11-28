// Catalogue des droits et matrice par defaut des postes (lot 1 des roles).
//
// SOURCE DE VERITE ECRITE A LA MAIN. Le SQL (`private.codes_droits()` et
// `private.matrice_postes()`, migration 20261128100000) en est la copie. Le
// test `src/lib/__tests__/permission-defaults-sql.test.ts` interdit tout ecart,
// dans les deux sens. Conception : docs/roles-personnel/conception-lot1.md B.

export const PERMISSION_CODES = [
  'menu.view',
  'menu.edit',
  'menu.price',
  'orders.take',
  'kitchen.track',
  'orders.cancel',
  'orders.discount',
  'orders.refund',
  'orders.pay',
  'cash.close',
  'cash.count',
  'reports.menu',
  'reports.money',
  'reports.own',
  'inventory.view',
  'inventory.edit',
  'suppliers.manage',
  'team.view',
  'team.manage',
  'settings.edit',
  'audit.view',
  'billing.manage',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** Les 11 postes, dans l'ordre canonique (le meme qu'en base). */
export const POSTE_CODES = [
  'owner',
  'manager',
  'chef',
  'cashier',
  'bartender',
  'reception',
  'waiter',
  'cook',
  'crew',
  'sales',
  'production',
] as const;

export type Poste = (typeof POSTE_CODES)[number];
/** Postes attribuables et invitables : tous sauf le proprietaire. */
export type StaffPoste = Exclude<Poste, 'owner'>;

export const STAFF_POSTES = POSTE_CODES.filter((p): p is StaffPoste => p !== 'owner');

/**
 * `full` ouvre le droit. `limited` est un droit borne (code d'un responsable,
 * QR marchand, factures seules) : au lot 1 il n'ouvre AUCUNE ecriture, sauf la
 * lecture des factures pour `billing.manage`.
 */
export type PermissionLevel = 'full' | 'limited';

/** Reglage par personne ou par poste : `true` = droit entier, `false` = aucun droit. */
export type PermissionMap = Partial<Record<PermissionCode, boolean>>;

type PosteRow = Partial<Record<PermissionCode, PermissionLevel>>;

const all = (level: PermissionLevel): PosteRow =>
  Object.fromEntries(PERMISSION_CODES.map((c) => [c, level])) as PosteRow;

const union = (...rows: PosteRow[]): PosteRow => {
  const out: PosteRow = {};
  for (const row of rows)
    for (const [code, level] of Object.entries(row) as [PermissionCode, PermissionLevel][])
      if (level === 'full' || out[code] === undefined) out[code] = level;
  return out;
};

const cashier: PosteRow = {
  'menu.view': 'full',
  'orders.take': 'full',
  'orders.pay': 'full',
  'cash.count': 'full',
  'reports.own': 'full',
  'orders.cancel': 'limited',
  'orders.discount': 'limited',
  'orders.refund': 'limited',
};

// Decision G.b.1 du proprietaire : le serveur n'encaisse pas avant le lot 3
// (`orders.pay` reste `limited` tant que la limite au QR marchand n'existe pas).
const waiter: PosteRow = {
  'menu.view': 'full',
  'orders.take': 'full',
  'reports.own': 'full',
  'orders.pay': 'limited',
  'orders.cancel': 'limited',
  'orders.discount': 'limited',
};

const cook: PosteRow = { 'menu.view': 'full', 'kitchen.track': 'full', 'inventory.view': 'full' };

/**
 * Matrice par defaut, 86 cases. `owner` n'y est pas : il a toujours `full` sur
 * les 22 droits et son poste ne se regle pas.
 */
export const POSTE_MATRIX: Record<StaffPoste, PosteRow> = {
  manager: { ...all('full'), 'billing.manage': 'limited' },
  chef: {
    'menu.view': 'full',
    'menu.edit': 'full',
    'menu.price': 'full',
    'kitchen.track': 'full',
    'reports.menu': 'full',
    'inventory.view': 'full',
    'inventory.edit': 'full',
    'suppliers.manage': 'full',
  },
  cashier,
  bartender: { ...cashier, 'kitchen.track': 'full', 'inventory.view': 'full' },
  reception: cashier,
  waiter,
  cook,
  crew: union(cashier, waiter, cook),
  sales: cashier,
  production: cook,
};
