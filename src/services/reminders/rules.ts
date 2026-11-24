// Regles du moteur de rappels: fonctions PURES (aucune base, aucun reseau).
// Chaque regle repond a deux questions sur des faits mesures: faut-il prevenir
// quelqu'un MAINTENANT, et qui peut agir ? Le moteur (reminder.service.ts) se
// charge des lectures, du "deja envoye", des preferences et de l'envoi.

import type { AdminRole } from '@/types/admin.types';
import type { ReminderRule, ReminderSettings } from '@/lib/validations/reminders.schema';
import { localClock, openingMinutesForDay } from '@/lib/opening-hours';
import type { OpeningHoursMap } from '@/types/admin.types';

export interface StaffMember {
  id: string;
  userId: string | null;
  tenantId: string;
  role: AdminRole;
}

export interface DueReminder {
  tenantId: string;
  rule: ReminderRule;
  /** Ce sur quoi porte le rappel (commande, jour, semaine): cle anti-doublon. */
  subjectKey: string;
  recipientId: string;
  level: 1 | 2;
  /** Ce qu'on nomme dans le message (mis en forme dans la langue du restaurant). */
  ref: SubjectRef;
}

/** La table si on la connait, sinon le numero de commande. */
export interface SubjectRef {
  table: string | null;
  order: string;
}

const MANAGER_ROLES: readonly AdminRole[] = ['owner', 'admin', 'manager'];
const MINUTE = 60_000;

export function managersOf(staff: StaffMember[], tenantId: string): StaffMember[] {
  return staff.filter((s) => s.tenantId === tenantId && MANAGER_ROLES.includes(s.role));
}

function refOf(o: { table_number: string | null; order_number: string }): SubjectRef {
  return { table: o.table_number, order: o.order_number };
}

/**
 * Niveau 1 a ceux qui peuvent agir; niveau 2 (escalade, delai double) aux
 * responsables, sauf a qui a deja recu le niveau 1.
 */
function levels(
  base: Omit<DueReminder, 'recipientId' | 'level'>,
  ageMin: number,
  thresholdMin: number,
  first: StaffMember[],
  managers: StaffMember[],
): DueReminder[] {
  if (ageMin < thresholdMin) return [];
  const out: DueReminder[] = [];
  const level1 = first.length > 0 ? first : managers;
  for (const s of level1) out.push({ ...base, recipientId: s.id, level: 1 });
  if (ageMin >= thresholdMin * 2) {
    const already = new Set(level1.map((s) => s.id));
    for (const m of managers) {
      if (!already.has(m.id)) out.push({ ...base, recipientId: m.id, level: 2 });
    }
  }
  return out;
}

export interface ReadyOrder {
  id: string;
  tenant_id: string;
  ready_at: string;
  server_id: string | null;
  table_id: string | null;
  table_number: string | null;
  order_number: string;
}

/** Commande prete depuis X minutes et pas servie: serveur, puis responsables. */
export function dueReadyNotServed(
  orders: ReadyOrder[],
  settingsOf: (tenantId: string) => ReminderSettings,
  assignedServer: (tableId: string) => string | null,
  staff: StaffMember[],
  now: Date,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const o of orders) {
    const settings = settingsOf(o.tenant_id);
    if (!settings.rules.order_ready_not_served) continue;
    const ageMin = (now.getTime() - new Date(o.ready_at).getTime()) / MINUTE;
    const tenantStaff = staff.filter((s) => s.tenantId === o.tenant_id);
    const ids = new Set(
      [o.server_id, o.table_id ? assignedServer(o.table_id) : null].filter((v): v is string => !!v),
    );
    const servers = tenantStaff.filter((s) => ids.has(s.id));
    out.push(
      ...levels(
        {
          tenantId: o.tenant_id,
          rule: 'order_ready_not_served',
          // Un nouveau passage a "prete" (renvoyee en cuisine) = un nouveau sujet.
          subjectKey: `${o.id}@${o.ready_at}`,
          ref: refOf(o),
        },
        ageMin,
        settings.ready_not_served_min,
        servers,
        managersOf(staff, o.tenant_id),
      ),
    );
  }
  return out;
}

export interface WaitingOrder {
  id: string;
  tenant_id: string;
  created_at: string;
  table_number: string | null;
  order_number: string;
}

/** Commande recue et pas commencee depuis N minutes: cuisine, puis responsables. */
export function dueNotStarted(
  orders: WaitingOrder[],
  settingsOf: (tenantId: string) => ReminderSettings,
  staff: StaffMember[],
  now: Date,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const o of orders) {
    const settings = settingsOf(o.tenant_id);
    if (!settings.rules.order_not_started) continue;
    const ageMin = (now.getTime() - new Date(o.created_at).getTime()) / MINUTE;
    const chefs = staff.filter((s) => s.tenantId === o.tenant_id && s.role === 'chef');
    out.push(
      ...levels(
        { tenantId: o.tenant_id, rule: 'order_not_started', subjectKey: o.id, ref: refOf(o) },
        ageMin,
        settings.not_started_min,
        chefs,
        managersOf(staff, o.tenant_id),
      ),
    );
  }
  return out;
}

/** Combien de minutes avant l'ouverture on previent pour les ruptures. */
const PRE_SERVICE_LEAD_MIN = 30;
/**
 * Les rappels a heure fixe ne sont evalues que pendant 3 minutes: assez pour
 * survivre a un passage manque de la tache planifiee, sans relancer les
 * lectures lourdes chaque minute pendant une heure.
 */
const SCHEDULED_EVAL_MIN = 3;

const DAY_MS = 24 * 60 * MINUTE;

/**
 * "30 minutes avant l'ouverture", a l'heure DU restaurant. Rend la date locale
 * du jour d'ouverture (cle "une fois par jour") ou null hors fenetre. Une
 * ouverture a minuit ou peu apres est prevenue la veille au soir. Sans
 * horaires renseignes, on ne sait pas quand le service commence: on se tait.
 */
export function preServiceWindow(
  openingHours: OpeningHoursMap | null | undefined,
  timeZone: string,
  now: Date,
): { ymd: string; openAt: string } | null {
  const today = localClock(now, timeZone);
  const tomorrow = localClock(new Date(now.getTime() + DAY_MS), timeZone);
  const candidates = [
    { clock: today, open: openingMinutesForDay(openingHours, today.day), offset: 0 },
    { clock: tomorrow, open: openingMinutesForDay(openingHours, tomorrow.day), offset: 24 * 60 },
  ];
  for (const { clock, open, offset } of candidates) {
    if (open === null) continue;
    const minutesUntil = open + offset - today.minutes;
    if (
      minutesUntil <= PRE_SERVICE_LEAD_MIN &&
      minutesUntil > PRE_SERVICE_LEAD_MIN - SCHEDULED_EVAL_MIN
    ) {
      const h = String(Math.floor(open / 60)).padStart(2, '0');
      const m = String(open % 60).padStart(2, '0');
      return { ymd: clock.ymd, openAt: `${h}:${m}` };
    }
  }
  return null;
}

/** Lundi a 9 h, heure du restaurant: le moment du bilan de la semaine. */
export function weeklyCoachWindow(timeZone: string, now: Date): { ymd: string } | null {
  const clock = localClock(now, timeZone);
  const start = 9 * 60;
  if (clock.day !== 1 || clock.minutes < start || clock.minutes >= start + SCHEDULED_EVAL_MIN) {
    return null;
  }
  return { ymd: clock.ymd };
}

/** Seuils de donnees en dessous desquels le coach se tait. */
const COACH_MIN_WEEKS = 4;
export const COACH_MIN_ORDERS = 80;

export interface CoachFacts {
  weeks: number;
  ordersInWindow: number;
  peak: { day: number; hour: number; avgOrders: number } | null;
  dropped: { name: string; previousWeeklyAvg: number }[];
}

/** Agregats calcules en base (reminder_coach_slots / reminder_coach_items). */
export interface CoachAggregates {
  /** Commandes par (jour, heure) a l'heure du restaurant, sur les 4 semaines. */
  slots: { dow: number; hour: number; orders: number }[];
  /** Ventes par plat: 3 semaines d'avant, puis la derniere semaine. */
  items: { name: string; before_qty: number; last_week_qty: number }[];
  firstOrderAt: string | null;
}

/**
 * Faits de la semaine, calcules UNIQUEMENT sur les commandes du restaurant
 * des 4 dernieres semaines. Null si les donnees ne suffisent pas: mieux vaut
 * se taire qu'affirmer une heure de pointe sur trois commandes.
 *
 * - Heure de pointe: le creneau (jour, heure) le plus charge en moyenne.
 * - Plats en recul: vendus au moins 2 fois par semaine en moyenne sur les
 *   3 semaines precedentes, et 0 fois la semaine derniere.
 */
export function coachFacts(agg: CoachAggregates, now: Date): CoachFacts | null {
  const windowStart = now.getTime() - COACH_MIN_WEEKS * 7 * DAY_MS;
  if (!agg.firstOrderAt || new Date(agg.firstOrderAt).getTime() > windowStart) return null;
  const ordersInWindow = agg.slots.reduce((sum, s) => sum + s.orders, 0);
  if (ordersInWindow < COACH_MIN_ORDERS) return null;

  let peak: CoachFacts['peak'] = null;
  for (const s of agg.slots) {
    const avg = s.orders / COACH_MIN_WEEKS;
    if (!peak || avg > peak.avgOrders) peak = { day: s.dow, hour: s.hour, avgOrders: avg };
  }

  const dropped = agg.items
    .map((i) => ({
      name: i.name,
      previousWeeklyAvg: i.before_qty / (COACH_MIN_WEEKS - 1),
      lastWeek: i.last_week_qty,
    }))
    .filter((d) => d.previousWeeklyAvg >= 2 && d.lastWeek === 0)
    .sort((a, b) => b.previousWeeklyAvg - a.previousWeeklyAvg)
    .slice(0, 3)
    .map(({ name, previousWeeklyAvg }) => ({ name, previousWeeklyAvg }));

  return { weeks: COACH_MIN_WEEKS, ordersInWindow, peak, dropped };
}
