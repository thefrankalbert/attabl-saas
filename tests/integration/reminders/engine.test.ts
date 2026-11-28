/**
 * Moteur de rappels contre un VRAI Postgres local (harnais: `pnpm test:db`).
 *
 * Les tests unitaires figent les regles pures et l'envoi avec une fausse base.
 * Celui-ci fait tourner le moteur entier (createReminderService.tick) sur les
 * vraies tables, la vraie RLS, le vrai declencheur ready_at et la vraie cle
 * unique anti-doublon, avec une horloge controlee. Seul le push est simule
 * (aucune cle VAPID en local): on enregistre a qui il serait parti.
 *
 * Restaurant de test au Cameroun (UTC+1): les heures sont celles du restaurant.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { createReminderService } from '@/services/reminders/reminder.service';
import { localClock } from '@/lib/opening-hours';
import type { ServicePush } from '@/services/push.service';

const SLUG = 'reminders-engine-test';
const OTHER_SLUG = 'reminders-engine-other';
const TZ = 'Africa/Douala';
const db = getAdmin();
const MIN = 60_000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const pushes: { membres: string[]; titre: string; corps: string; alerte?: boolean }[] = [];
const push = {
  envoyerAuxAppareilsDuTenant: vi.fn(async (_t: string, charge, dest) => {
    pushes.push({
      membres: dest?.membres ?? [],
      titre: charge.titre,
      corps: charge.corps,
      alerte: charge.alerte,
    });
    return { envoyees: 1, expirees: 0, echecs: 0, refuses: 0 };
  }),
} as unknown as ServicePush;
const engine = createReminderService(db, { push });

let tenantId: string;
const staff: Record<'owner' | 'manager' | 'waiter' | 'chef', { id: string; userId: string }> =
  {} as never;
const authIds: string[] = [];
const T0 = new Date();
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

async function reminders() {
  const { data, error } = await db
    .from('reminders')
    .select('rule, subject_key, recipient_id, level, resolved_at, notification_id')
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return data ?? [];
}

async function order(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `CMD-RAPPEL-${randomUUID().slice(0, 6)}`,
      subtotal: 1000,
      total: 1000,
      ...fields,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`order: ${error?.message}`);
  return data.id as string;
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Rappels Test', is_active: true, country: 'Cameroun' })
    .select('id')
    .single();
  if (error || !tenant) throw new Error(`tenant: ${error?.message}`);
  tenantId = tenant.id as string;

  for (const role of ['owner', 'manager', 'waiter', 'chef'] as const) {
    const email = `rappel-${role}-${randomUUID().slice(0, 6)}@test.local`;
    const { data: u, error: uErr } = await db.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    if (uErr || !u.user) throw new Error(`user: ${uErr?.message}`);
    authIds.push(u.user.id);
    const { data: au, error: aErr } = await db
      .from('admin_users')
      .insert({ tenant_id: tenantId, user_id: u.user.id, email, role, is_active: true })
      .select('id')
      .single();
    if (aErr || !au) throw new Error(`admin_user: ${aErr?.message}`);
    staff[role] = { id: au.id as string, userId: u.user.id };
  }
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
  await teardownTenantBySlug(OTHER_SLUG);
  for (const id of authIds) await db.auth.admin.deleteUser(id);
});

describe('moteur de rappels (base reelle)', () => {
  let orderA: string;
  let orderB: string;

  it('commande pas lancee depuis 6 min: la cuisine, et elle seule', async () => {
    orderA = await order({
      status: 'pending',
      created_at: at(-6).toISOString(),
      table_number: '4',
    });
    pushes.length = 0;
    await engine.tick(at(0));

    const mine = (await reminders()).filter((r) => r.subject_key === orderA);
    expect(mine.map((r) => `${r.recipient_id}@${r.level}`)).toEqual([`${staff.chef.id}@1`]);
    expect(pushes.map((p) => p.membres)).toEqual([[staff.chef.id]]);
    expect(pushes[0].titre).toBe('Commande en attente depuis 5 min - Table 4');
    expect(pushes[0].alerte).toBe(true);

    // La cloche du chef a sa notification, a son nom.
    const { data: notif } = await db
      .from('notifications')
      .select('user_id, type, link')
      .eq('id', mine[0].notification_id as string)
      .single();
    expect(notif).toEqual({
      user_id: staff.chef.userId,
      type: 'reminder:order_not_started',
      link: '/kitchen',
    });
  });

  it('passage suivant: rien ne repart (cle unique + regroupement)', async () => {
    const before = (await reminders()).length;
    pushes.length = 0;
    await engine.tick(at(0.5));
    expect((await reminders()).length).toBe(before);
    expect(pushes).toEqual([]);
  });

  it('commande prete depuis 4 min: le serveur qui l a prise', async () => {
    orderB = await order({ status: 'preparing', server_id: staff.waiter.id, table_number: '8' });
    await db.from('orders').update({ status: 'ready' }).eq('id', orderB);
    const { data: o } = await db.from('orders').select('ready_at').eq('id', orderB).single();
    expect(o?.ready_at).not.toBeNull(); // le declencheur a bien horodate
    await db
      .from('orders')
      .update({ ready_at: at(-1).toISOString() })
      .eq('id', orderB);

    pushes.length = 0;
    await engine.tick(at(3));
    const mine = (await reminders()).filter((r) => r.subject_key.startsWith(`${orderB}@`));
    expect(mine.map((r) => `${r.recipient_id}@${r.level}`)).toEqual([`${staff.waiter.id}@1`]);
    expect(pushes.find((p) => p.membres[0] === staff.waiter.id)?.corps).toBe(
      'À servir maintenant : Table 8.',
    );
  });

  it('servie: le rappel est regle et retire de la cloche', async () => {
    const [before] = (await reminders()).filter((r) => r.subject_key.startsWith(`${orderB}@`));
    await db.from('orders').update({ status: 'delivered' }).eq('id', orderB);
    await engine.tick(at(3.5));

    const [after] = (await reminders()).filter((r) => r.subject_key.startsWith(`${orderB}@`));
    expect(after.resolved_at).not.toBeNull();
    const { data: gone } = await db
      .from('notifications')
      .select('id')
      .eq('id', before.notification_id as string);
    expect(gone).toEqual([]);
  });

  it('toujours pas lancee au double du delai: escalade aux responsables', async () => {
    pushes.length = 0;
    await engine.tick(at(5)); // commande A: 11 min
    const level2 = (await reminders())
      .filter((r) => r.subject_key === orderA && r.level === 2)
      .map((r) => r.recipient_id)
      .sort();
    expect(level2).toEqual([staff.owner.id, staff.manager.id].sort());
    // Le titre de l'escalade ne minimise jamais l'attente (11 min, pas "5 min").
    expect(pushes.find((p) => p.membres[0] === staff.owner.id)?.titre).toBe(
      'Commande en attente depuis plus de 10 min - Table 4',
    );
  });

  it('un rappel coupe par la personne ne lui parvient plus', async () => {
    await db.from('reminder_preferences').insert({
      admin_user_id: staff.chef.id,
      tenant_id: tenantId,
      rule: 'order_not_started',
      muted: true,
    });
    const orderD = await order({ status: 'pending', created_at: at(2).toISOString() });
    pushes.length = 0;
    await engine.tick(at(8)); // D: 6 min, au-dela du delai
    expect((await reminders()).filter((r) => r.subject_key === orderD)).toEqual([]);
    await db.from('reminder_preferences').delete().eq('admin_user_id', staff.chef.id);
    // Temoin: rallume, le meme rappel part.
    await engine.tick(at(8.5));
    expect((await reminders()).filter((r) => r.subject_key === orderD)).toHaveLength(1);
  });

  it('30 min avant l ouverture, a l heure du restaurant: ingredients epuises', async () => {
    const now = at(20);
    const clock = localClock(now, TZ);
    const open = clock.minutes + 29; // ouvre dans 29 min (fenetre: 27 a 30 min avant)
    const hhmm = `${String(Math.floor(open / 60) % 24).padStart(2, '0')}:${String(open % 60).padStart(2, '0')}`;
    if (open >= 24 * 60 - 1) return; // pas de fenetre testable a cheval sur minuit
    await db
      .from('tenants')
      .update({ opening_hours: { [DAY_KEYS[clock.day]]: { open: hhmm, close: '23:59' } } })
      .eq('id', tenantId);
    await db
      .from('ingredients')
      .insert({ tenant_id: tenantId, name: 'Poulet', unit: 'kg', min_stock_alert: 0 });

    pushes.length = 0;
    await engine.tick(now);
    // Le meme passage peut aussi escalader des commandes des etapes precedentes.
    const pre = pushes.filter((p) => p.titre.startsWith("Avant l'ouverture"));
    const titles = pre.map((p) => p.titre);
    expect(titles).toEqual([
      `Avant l'ouverture de ${hhmm} : vérifiez le stock`,
      `Avant l'ouverture de ${hhmm} : vérifiez le stock`,
    ]);
    expect(pre.map((p) => p.membres[0]).sort()).toEqual([staff.owner.id, staff.manager.id].sort());
    expect(pre[0].corps).toBe('Épuisé(s) : Poulet.');

    // Une seule fois par jour.
    pushes.length = 0;
    await engine.tick(at(21));
    expect(pushes.filter((p) => p.titre.startsWith("Avant l'ouverture"))).toEqual([]);
  });

  it('le bilan du lundi: des faits mesures, a qui a le droit reports.money (proprietaire et gerant)', async () => {
    // Prochain lundi 09:01, heure de Douala (UTC+1) = 08:01 UTC.
    const monday = new Date(T0);
    monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
    monday.setUTCHours(8, 1, 0, 0);
    // 4 samedis precedents, 13 h a Douala (12:00 UTC), 300 commandes chacun:
    // 1200 au total, au-dela du plafond de 1000 lignes de l'API.
    const rows = [2, 9, 16, 23].flatMap((d) => {
      const sat = new Date(monday.getTime() - d * 24 * 60 * MIN);
      sat.setUTCHours(12, 0, 0, 0);
      return Array.from({ length: 300 }, () => ({
        tenant_id: tenantId,
        order_number: `CMD-COACH-${randomUUID().slice(0, 8)}`,
        status: 'delivered',
        subtotal: 1000,
        total: 1000,
        created_at: sat.toISOString(),
      }));
    });
    rows.push({
      ...rows[0],
      order_number: 'CMD-COACH-FIRST',
      created_at: new Date(monday.getTime() - 40 * 24 * 60 * MIN).toISOString(),
    });
    const { error } = await db.from('orders').insert(rows);
    expect(error).toBeNull();

    pushes.length = 0;
    await engine.tick(monday);
    const coach = pushes.filter((p) => p.titre === 'Vos 4 dernières semaines en chiffres');
    // Le bilan porte du chiffre d'affaires: il va a qui detient `reports.money`.
    // Par defaut le proprietaire ET le gerant (avant le lot des postes: le
    // proprietaire et l'administrateur). Ni le serveur ni le chef.
    expect(coach.map((p) => p.membres[0]).sort()).toEqual(
      [staff.owner.id, staff.manager.id].sort(),
    );
    expect(coach[0].corps).toContain('le samedi de 13 h à 14 h, 300 commande(s) en moyenne');
    // Le compte exact, lu en base (les commandes des etapes precedentes comptent
    // aussi). Avant le calcul en base, la lecture s'arretait a 1000 lignes.
    const { count } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', new Date(monday.getTime() - 28 * 24 * 60 * MIN).toISOString())
      .lt('created_at', monday.toISOString());
    expect(count).toBeGreaterThan(1000);
    expect(coach[0].corps).toContain(`(Sur ${count} commandes.)`);
  });

  it('notification groupee: elle reste tant qu une des commandes attend encore', async () => {
    const t = at(30);
    const o1 = await order({ status: 'preparing', server_id: staff.waiter.id, table_number: '21' });
    const o2 = await order({ status: 'preparing', server_id: staff.waiter.id, table_number: '22' });
    await db.from('orders').update({ status: 'ready' }).in('id', [o1, o2]);
    await db
      .from('orders')
      .update({ ready_at: new Date(t.getTime() - 4 * MIN).toISOString() })
      .in('id', [o1, o2]);
    pushes.length = 0;
    await engine.tick(t);
    const grouped = (await reminders()).filter(
      (r) => r.subject_key.startsWith(`${o1}@`) || r.subject_key.startsWith(`${o2}@`),
    );
    expect(grouped).toHaveLength(2);
    expect(new Set(grouped.map((r) => r.notification_id)).size).toBe(1);
    expect(pushes.find((p) => p.membres[0] === staff.waiter.id)?.titre).toBe(
      '2 commandes prêtes attendent',
    );
    const notifId = grouped[0].notification_id as string;

    await db.from('orders').update({ status: 'delivered' }).eq('id', o1);
    await engine.tick(new Date(t.getTime() + 30_000));
    const { data: still } = await db.from('notifications').select('id').eq('id', notifId);
    expect(still).toHaveLength(1); // table 22 attend toujours

    await db.from('orders').update({ status: 'delivered' }).eq('id', o2);
    await engine.tick(new Date(t.getTime() + 60_000));
    const { data: gone } = await db.from('notifications').select('id').eq('id', notifId);
    expect(gone).toEqual([]);
  });

  it('un autre restaurant: ses rappels vont a son personnel, jamais a celui-ci', async () => {
    await teardownTenantBySlug(OTHER_SLUG);
    const { data: other } = await db
      .from('tenants')
      .insert({ slug: OTHER_SLUG, name: 'Autre', is_active: true, country: 'Burkina Faso' })
      .select('id')
      .single();
    const email = `rappel-autre-${randomUUID().slice(0, 6)}@test.local`;
    const { data: u } = await db.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    authIds.push(u.user!.id);
    const { data: chefB } = await db
      .from('admin_users')
      .insert({ tenant_id: other!.id, user_id: u.user!.id, email, role: 'chef', is_active: true })
      .select('id')
      .single();
    const t = at(40);
    const { data: oB } = await db
      .from('orders')
      .insert({
        tenant_id: other!.id,
        order_number: 'CMD-AUTRE',
        status: 'pending',
        subtotal: 1000,
        total: 1000,
        created_at: new Date(t.getTime() - 6 * MIN).toISOString(),
      })
      .select('id')
      .single();

    await engine.tick(t);
    const { data: forB } = await db
      .from('reminders')
      .select('recipient_id, tenant_id')
      .eq('subject_key', oB!.id);
    expect(forB).toEqual([{ recipient_id: chefB!.id, tenant_id: other!.id }]);
    // Aucun rappel de ce restaurant n'a jamais vise le personnel de l'autre.
    const mine = await reminders();
    const ours = new Set(Object.values(staff).map((s) => s.id));
    expect(mine.every((r) => ours.has(r.recipient_id))).toBe(true);
    await teardownTenantBySlug(OTHER_SLUG);
  });
});
