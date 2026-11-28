import { describe, it, expect } from 'vitest';
import {
  coachFacts,
  dueNotStarted,
  dueReadyNotServed,
  preServiceWindow,
  weeklyCoachWindow,
  COACH_MIN_ORDERS,
  type StaffMember,
} from '../rules';
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from '@/lib/validations/reminders.schema';
import { serviceMessage, preServiceMessage, coachMessage, formatRef, localeOf } from '../messages';

const T = 'tenant-a';
const NOW = new Date('2026-11-16T12:00:00Z'); // lundi
const staff: StaffMember[] = [
  { id: 'owner', userId: 'u-owner', tenantId: T, postes: ['owner'] },
  { id: 'manager', userId: 'u-manager', tenantId: T, postes: ['manager'] },
  { id: 'waiter1', userId: 'u-w1', tenantId: T, postes: ['waiter'] },
  { id: 'waiter2', userId: 'u-w2', tenantId: T, postes: ['waiter'] },
  { id: 'chef', userId: 'u-chef', tenantId: T, postes: ['chef'] },
  { id: 'other-owner', userId: 'u-x', tenantId: 'tenant-b', postes: ['owner'] },
];
const settings =
  (over: Partial<ReminderSettings> = {}) =>
  () => ({
    ...DEFAULT_REMINDER_SETTINGS,
    ...over,
  });
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const ready = (agoMin: number, over: Record<string, unknown> = {}) => ({
  id: 'o1',
  tenant_id: T,
  ready_at: minAgo(agoMin),
  server_id: 'waiter1',
  table_id: 't8',
  table_number: '8',
  order_number: 'CMD-1',
  ...over,
});
const noAssign = () => null;
const recipients = (d: { recipientId: string; level: number }[]) =>
  d.map((x) => `${x.recipientId}@${x.level}`).sort();

describe('dueReadyNotServed', () => {
  it('avant le delai: personne', () => {
    expect(dueReadyNotServed([ready(2.9)], settings(), noAssign, staff, NOW)).toEqual([]);
  });

  it('au delai: le serveur qui a pris la commande, et lui seul', () => {
    const d = dueReadyNotServed([ready(3)], settings(), noAssign, staff, NOW);
    expect(recipients(d)).toEqual(['waiter1@1']);
    expect(d[0].ref).toEqual({ table: '8', order: 'CMD-1' });
  });

  it('le serveur attribue a la table est aussi prevenu', () => {
    const d = dueReadyNotServed([ready(3)], settings(), () => 'waiter2', staff, NOW);
    expect(recipients(d)).toEqual(['waiter1@1', 'waiter2@1']);
  });

  it('sans serveur connu: les responsables directement', () => {
    const d = dueReadyNotServed([ready(3, { server_id: null })], settings(), noAssign, staff, NOW);
    expect(recipients(d)).toEqual(['manager@1', 'owner@1']);
  });

  it('au double du delai: escalade aux responsables, jamais a un autre restaurant', () => {
    const d = dueReadyNotServed([ready(6)], settings(), noAssign, staff, NOW);
    expect(recipients(d)).toEqual(['manager@2', 'owner@2', 'waiter1@1']);
  });

  it('le delai est celui du restaurant', () => {
    const s = settings({ ready_not_served_min: 10 });
    expect(dueReadyNotServed([ready(6)], s, noAssign, staff, NOW)).toEqual([]);
  });

  it('regle coupee par le restaurant: rien', () => {
    const s = settings({
      rules: { ...DEFAULT_REMINDER_SETTINGS.rules, order_ready_not_served: false },
    });
    expect(dueReadyNotServed([ready(9)], s, noAssign, staff, NOW)).toEqual([]);
  });

  it('le sujet porte l heure du passage a prete (renvoyee puis prete = nouveau rappel)', () => {
    const [d] = dueReadyNotServed([ready(3)], settings(), noAssign, staff, NOW);
    expect(d.subjectKey).toBe(`o1@${minAgo(3)}`);
  });
});

describe('dueNotStarted', () => {
  const waiting = (agoMin: number) => ({
    id: 'o2',
    tenant_id: T,
    created_at: minAgo(agoMin),
    table_number: null,
    order_number: 'CMD-2',
  });

  it('au delai: la cuisine', () => {
    const d = dueNotStarted([waiting(5)], settings(), staff, NOW);
    expect(recipients(d)).toEqual(['chef@1']);
    expect(d[0].ref).toEqual({ table: null, order: 'CMD-2' });
  });

  it('avant le delai: rien', () => {
    expect(dueNotStarted([waiting(4)], settings(), staff, NOW)).toEqual([]);
  });

  it('sans compte cuisine: les responsables', () => {
    const noChef = staff.filter((s) => !s.postes.includes('chef'));
    expect(recipients(dueNotStarted([waiting(5)], settings(), noChef, NOW))).toEqual([
      'manager@1',
      'owner@1',
    ]);
  });
});

describe('destinataires par poste (cumul compris)', () => {
  const mixed: StaffMember[] = [
    { id: 'm-cash', userId: 'u-mc', tenantId: T, postes: ['manager', 'cashier'] },
    { id: 'cook', userId: 'u-cook', tenantId: T, postes: ['cook'] },
    { id: 'w', userId: 'u-w', tenantId: T, postes: ['waiter'] },
    { id: 'cash', userId: 'u-cash', tenantId: T, postes: ['cashier'] },
  ];

  it('responsables = postes contenant owner ou manager, meme cumules', () => {
    const d = dueReadyNotServed([ready(3, { server_id: null })], settings(), noAssign, mixed, NOW);
    expect(recipients(d)).toEqual(['m-cash@1']);
    // temoin: le serveur et le caissier seuls ne sont jamais responsables
    expect(recipients(d)).not.toContain('w@1');
    expect(recipients(d)).not.toContain('cash@1');
  });

  it('cuisine = chef ou cuisinier', () => {
    const d = dueNotStarted(
      [{ id: 'o3', tenant_id: T, created_at: minAgo(5), table_number: null, order_number: 'C3' }],
      settings(),
      mixed,
      NOW,
    );
    expect(recipients(d)).toEqual(['cook@1']);
  });

  it('un poste de cuisine cumule avec un autre reste cuisine; le chef est cuisine', () => {
    const team: StaffMember[] = [
      { id: 'chef-bar', userId: 'u1', tenantId: T, postes: ['chef', 'bartender'] },
      { id: 'w', userId: 'u2', tenantId: T, postes: ['waiter'] },
    ];
    const d = dueNotStarted(
      [{ id: 'o4', tenant_id: T, created_at: minAgo(5), table_number: null, order_number: 'C4' }],
      settings(),
      team,
      NOW,
    );
    expect(recipients(d)).toEqual(['chef-bar@1']);
  });
});

describe('fenetres horaires, a l heure du restaurant', () => {
  const hours = { mon: { open: '12:30', close: '15:00' } };

  it('30 min avant l ouverture a Douala (UTC+1): 11:00 UTC = 12:00 sur place', () => {
    expect(preServiceWindow(hours, 'Africa/Douala', new Date('2026-11-16T11:00:00Z'))).toEqual({
      ymd: '2026-11-16',
      openAt: '12:30',
    });
  });

  it('temoin: meme instant a Abidjan (11:00 sur place) = hors fenetre', () => {
    expect(preServiceWindow(hours, 'Africa/Abidjan', new Date('2026-11-16T11:00:00Z'))).toBeNull();
  });

  it('a l heure d ouverture: trop tard, plus de rappel', () => {
    expect(preServiceWindow(hours, 'Africa/Douala', new Date('2026-11-16T11:30:00Z'))).toBeNull();
  });

  it('fenetre de 3 minutes seulement (27 min avant: plus evalue)', () => {
    expect(preServiceWindow(hours, 'Africa/Douala', new Date('2026-11-16T11:03:00Z'))).toBeNull();
  });

  it('ouverture a minuit et quart: prevenu la veille au soir, date du jour d ouverture', () => {
    const night = { tue: { open: '00:15', close: '05:00' } };
    // Lundi 22:46 UTC = 23:46 a Douala, ouverture mardi 00:15 dans 29 min.
    expect(preServiceWindow(night, 'Africa/Douala', new Date('2026-11-16T22:46:00Z'))).toEqual({
      ymd: '2026-11-17',
      openAt: '00:15',
    });
  });

  it('sans horaires: on se tait', () => {
    expect(preServiceWindow({}, 'Africa/Douala', new Date('2026-11-16T11:00:00Z'))).toBeNull();
  });

  it('bilan: lundi 9 h sur place, fenetre de 3 minutes', () => {
    expect(weeklyCoachWindow('Africa/Douala', new Date('2026-11-16T08:01:00Z'))).toEqual({
      ymd: '2026-11-16',
    });
    // Evalue 3 minutes seulement: pas de lectures lourdes chaque minute pendant 1 h.
    expect(weeklyCoachWindow('Africa/Douala', new Date('2026-11-16T08:03:00Z'))).toBeNull();
    expect(weeklyCoachWindow('Africa/Douala', new Date('2026-11-16T09:15:00Z'))).toBeNull();
    expect(weeklyCoachWindow('Africa/Douala', new Date('2026-11-17T08:15:00Z'))).toBeNull();
  });
});

describe('coachFacts: seulement des faits mesures (agregats calcules en base)', () => {
  const day = 24 * 60 * 60_000;
  const first = new Date(NOW.getTime() - 60 * day).toISOString();
  const busy = [
    { dow: 6, hour: 13, orders: 100 },
    { dow: 5, hour: 20, orders: 40 },
  ];

  it('pas assez d anciennete: silence', () => {
    const recent = new Date(NOW.getTime() - 10 * day).toISOString();
    expect(coachFacts({ slots: busy, items: [], firstOrderAt: recent }, NOW)).toBeNull();
  });

  it('pas assez de commandes: silence', () => {
    const few = [{ dow: 6, hour: 13, orders: COACH_MIN_ORDERS - 1 }];
    expect(coachFacts({ slots: few, items: [], firstOrderAt: first }, NOW)).toBeNull();
  });

  it('heure de pointe: le creneau le plus charge, moyenne sur 4 semaines', () => {
    const f = coachFacts({ slots: busy, items: [], firstOrderAt: first }, NOW);
    expect(f?.peak).toEqual({ day: 6, hour: 13, avgOrders: 25 });
    expect(f?.ordersInWindow).toBe(140);
  });

  it('plat en recul: vendu chaque semaine avant, plus du tout la derniere', () => {
    const items = [
      { name: 'Poulet braise', before_qty: 9, last_week_qty: 0 },
      { name: 'Alloco', before_qty: 9, last_week_qty: 3 },
      { name: 'Rare', before_qty: 3, last_week_qty: 0 },
    ];
    const f = coachFacts({ slots: busy, items, firstOrderAt: first }, NOW);
    expect(f?.dropped).toEqual([{ name: 'Poulet braise', previousWeeklyAvg: 3 }]);
  });
});

describe('messages', () => {
  it('escalade: jamais un delai plus petit que l attente reelle', () => {
    expect(serviceMessage('order_not_started', 2, ['Table 4'], 5).title).toBe(
      'Commande en attente depuis plus de 10 min - Table 4',
    );
    expect(serviceMessage('order_not_started', 1, ['Table 4'], 5).title).toBe(
      'Commande en attente depuis 5 min - Table 4',
    );
  });

  it('en anglais pour un restaurant anglophone', () => {
    expect(serviceMessage('order_ready_not_served', 1, ['Table 8'], 3, 'en').title).toBe(
      'Order ready for 3 min - Table 8',
    );
    expect(localeOf('en-US')).toBe('en');
    expect(localeOf('fr-FR')).toBe('fr');
    expect(localeOf(null)).toBe('fr');
  });

  it('la table si connue, sinon le numero de commande', () => {
    expect(formatRef({ table: '8', order: 'CMD-1' })).toBe('Table 8');
    expect(formatRef({ table: null, order: 'CMD-1' })).toBe('CMD-1');
  });

  it('regroupe plusieurs commandes en un seul message', () => {
    const m = serviceMessage('order_ready_not_served', 1, ['Table 4', 'Table 8'], 3);
    expect(m.title).toBe('2 commandes prêtes attendent');
    expect(m.body).toBe('À servir maintenant : Table 4, Table 8.');
    expect(m.urgent).toBe(true);
  });

  it('avant service: les faits, pas de conseil invente', () => {
    const m = preServiceMessage('18:00', {
      outOfStock: ['Poulet'],
      low: [],
      hiddenDishes: ['Poulet braise'],
    });
    expect(m.body).toBe('Épuisé(s) : Poulet. Plat(s) retiré(s) de la carte : Poulet braise.');
  });

  it('bilan: les chiffres et le nombre de commandes qui les fondent', () => {
    const m = coachMessage({
      weeks: 4,
      ordersInWindow: 100,
      peak: { day: 6, hour: 13, avgOrders: 25 },
      dropped: [],
    });
    expect(m.body).toBe(
      'Votre créneau le plus chargé : le samedi de 13 h à 14 h, 25 commande(s) en moyenne. (Sur 100 commandes.)',
    );
  });
});
