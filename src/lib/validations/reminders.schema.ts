import { z } from 'zod';

/** Les regles du moteur de rappels (meme liste que la contrainte SQL). */
export const REMINDER_RULES = [
  'order_ready_not_served',
  'order_not_started',
  'pre_service_stock',
  'weekly_coach',
] as const;

export type ReminderRule = (typeof REMINDER_RULES)[number];

const reminderRuleSchema = z.enum(REMINDER_RULES);

/**
 * Reglages d'un restaurant. Les delais sont ceux DU restaurant: une cuisine de
 * grillades n'a pas le rythme d'un bar. Bornes larges mais finies, pour qu'un
 * reglage ne puisse ni inonder le personnel (1 min) ni rendre la regle muette.
 */
export const reminderSettingsSchema = z.object({
  rules: z.object({
    order_ready_not_served: z.boolean(),
    order_not_started: z.boolean(),
    pre_service_stock: z.boolean(),
    weekly_coach: z.boolean(),
  }),
  ready_not_served_min: z.number().int().min(2).max(30),
  not_started_min: z.number().int().min(3).max(60),
});

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  rules: {
    order_ready_not_served: true,
    order_not_started: true,
    pre_service_stock: true,
    weekly_coach: true,
  },
  ready_not_served_min: 3,
  not_started_min: 5,
};

/**
 * Lit la configuration stockee (jsonb libre en base) sans jamais lever: une
 * valeur absente ou invalide retombe sur le defaut, champ par champ.
 */
export function parseReminderSettings(raw: unknown): ReminderSettings {
  const base = DEFAULT_REMINDER_SETTINGS;
  if (!raw || typeof raw !== 'object') return base;
  const merged = {
    ...base,
    ...(raw as Record<string, unknown>),
    rules: {
      ...base.rules,
      ...(((raw as Record<string, unknown>).rules as Record<string, unknown> | undefined) ?? {}),
    },
  };
  const parsed = reminderSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

export const reminderMuteSchema = z.object({
  rule: reminderRuleSchema,
  muted: z.boolean(),
});
