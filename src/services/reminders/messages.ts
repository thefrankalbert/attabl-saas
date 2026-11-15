// Textes des rappels: courts, une action, des faits. Un seul endroit pour les
// relire. Accents oui; tirets longs, guillemets typographiques et points de
// suspension Unicode non (regle du projet). Langue = celle du restaurant
// (tenants.default_locale): la cloche et le push partent du serveur, qui ne
// connait pas la langue choisie dans le navigateur de chacun.

import type { ReminderRule } from '@/lib/validations/reminders.schema';
import type { CoachFacts, SubjectRef } from './rules';

export type ReminderLocale = 'fr' | 'en';

export interface ReminderMessage {
  title: string;
  body: string;
  /** Chemin dans l'espace admin, ex. /service. */
  url: string;
  /** Alerte a traiter tout de suite (vibration, reste affichee). */
  urgent: boolean;
}

export function localeOf(defaultLocale: string | null | undefined): ReminderLocale {
  return defaultLocale?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function formatRef(ref: SubjectRef): string {
  return ref.table ? `Table ${ref.table}` : ref.order;
}

const DAY_NAMES: Record<ReminderLocale, string[]> = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

function list(labels: string[], locale: ReminderLocale): string {
  const shown = labels.slice(0, 3).join(', ');
  if (labels.length <= 3) return shown;
  const more = labels.length - 3;
  return locale === 'en' ? `${shown} and ${more} more` : `${shown} et ${more} autre(s)`;
}

export function serviceMessage(
  rule: Extract<ReminderRule, 'order_ready_not_served' | 'order_not_started'>,
  level: 1 | 2,
  labels: string[],
  delayMin: number,
  locale: ReminderLocale = 'fr',
): ReminderMessage {
  const many = labels.length > 1;
  const en = locale === 'en';
  // Niveau 2 = escalade, envoyee au double du delai: dire "plus de 2N min",
  // jamais un chiffre plus petit que l'attente reelle.
  const since =
    level === 2 ? (en ? `over ${delayMin * 2}` : `plus de ${delayMin * 2}`) : `${delayMin}`;
  const names = list(labels, locale);
  if (rule === 'order_ready_not_served') {
    return {
      title: many
        ? en
          ? `${labels.length} ready orders are waiting`
          : `${labels.length} commandes prêtes attendent`
        : en
          ? `Order ready for ${since} min - ${labels[0]}`
          : `Commande prête depuis ${since} min - ${labels[0]}`,
      body:
        level === 2
          ? en
            ? `Still not served: ${names}. Can someone take it?`
            : `Toujours pas servie(s) : ${names}. Quelqu'un peut-il s'en charger ?`
          : en
            ? `Serve now: ${names}.`
            : `À servir maintenant : ${names}.`,
      url: '/service',
      urgent: true,
    };
  }
  return {
    title: many
      ? en
        ? `${labels.length} orders not started yet`
        : `${labels.length} commandes pas encore lancées`
      : en
        ? `Order waiting for ${since} min - ${labels[0]}`
        : `Commande en attente depuis ${since} min - ${labels[0]}`,
    body:
      level === 2
        ? en
          ? `The kitchen has not started: ${names}.`
          : `La cuisine n'a pas encore commencé : ${names}.`
        : en
          ? `Start in the kitchen: ${names}.`
          : `À lancer en cuisine : ${names}.`,
    url: '/kitchen',
    urgent: true,
  };
}

export interface StockFacts {
  outOfStock: string[];
  low: string[];
  hiddenDishes: string[];
}

export function preServiceMessage(
  openAt: string,
  facts: StockFacts,
  locale: ReminderLocale = 'fr',
): ReminderMessage {
  const en = locale === 'en';
  const parts: string[] = [];
  if (facts.outOfStock.length)
    parts.push(`${en ? 'Out of stock:' : 'Épuisé(s) :'} ${list(facts.outOfStock, locale)}.`);
  if (facts.hiddenDishes.length)
    parts.push(
      `${en ? 'Dish(es) off the menu:' : 'Plat(s) retiré(s) de la carte :'} ${list(facts.hiddenDishes, locale)}.`,
    );
  if (facts.low.length)
    parts.push(`${en ? 'Running low:' : 'Bientôt à court :'} ${list(facts.low, locale)}.`);
  return {
    title: en
      ? `Before opening at ${openAt}: check your stock`
      : `Avant l'ouverture de ${openAt} : vérifiez le stock`,
    body: parts.join(' '),
    url: '/inventory',
    urgent: false,
  };
}

export function coachMessage(facts: CoachFacts, locale: ReminderLocale = 'fr'): ReminderMessage {
  const en = locale === 'en';
  const parts: string[] = [];
  if (facts.peak) {
    const avg = Math.round(facts.peak.avgOrders);
    const day = DAY_NAMES[locale][facts.peak.day] ?? '';
    const { hour } = facts.peak;
    parts.push(
      en
        ? `Your busiest slot: ${day} from ${hour}:00 to ${hour + 1}:00, ${avg} order(s) on average.`
        : `Votre créneau le plus chargé : le ${day} de ${hour} h à ${hour + 1} h, ${avg} commande(s) en moyenne.`,
    );
  }
  for (const d of facts.dropped) {
    const before = Math.round(d.previousWeeklyAvg);
    parts.push(
      en
        ? `${d.name}: ${before} sale(s) a week before, 0 last week.`
        : `${d.name} : ${before} vente(s) par semaine avant, 0 la semaine dernière.`,
    );
  }
  const basis = en
    ? `(Based on ${facts.ordersInWindow} orders.)`
    : `(Sur ${facts.ordersInWindow} commandes.)`;
  return {
    title: en
      ? `Your last ${facts.weeks} weeks in numbers`
      : `Vos ${facts.weeks} dernières semaines en chiffres`,
    body: `${parts.join(' ')} ${basis}`,
    url: '/reports',
    urgent: false,
  };
}
