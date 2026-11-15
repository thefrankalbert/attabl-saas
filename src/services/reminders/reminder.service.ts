import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { resolveTenantTimezone } from '@/lib/timezones';
import {
  parseReminderSettings,
  type ReminderRule,
  type ReminderSettings,
} from '@/lib/validations/reminders.schema';
import type { AdminRole, OpeningHoursMap } from '@/types/admin.types';
import type { ServicePush } from '@/services/push.service';
import {
  dueNotStarted,
  dueReadyNotServed,
  managersOf,
  preServiceWindow,
  weeklyCoachWindow,
  type DueReminder,
  type ReadyOrder,
  type StaffMember,
  type WaitingOrder,
} from './rules';
import {
  coachMessage,
  formatRef,
  localeOf,
  preServiceMessage,
  serviceMessage,
  type ReminderMessage,
} from './messages';
import { loadCoachFacts, loadStockFacts } from './reminder-facts';
import { createReminderDelivery, type ReminderGroup } from './reminder-delivery';

/** Au-dela, ce n'est plus un probleme de service en cours mais de l'historique. */
export const LIVE_WINDOW_MIN = 180;
/**
 * Un rappel de service encore ouvert apres 6 h (commande jamais marquee
 * servie) n'est plus reverifie: sa notification quitte la cloche, il reste
 * compte "non regle" dans les mesures. Borne la taille des lectures.
 */
export const STALE_AFTER_MIN = 360;
/** Taille des lots d'identifiants (une URL GET trop longue est refusee). */
const ID_BATCH = 200;

const MINUTE = 60_000;
const SERVICE_RULES = ['order_ready_not_served', 'order_not_started'] as const;

interface TenantRow {
  id: string;
  slug: string;
  country: string | null;
  opening_hours: OpeningHoursMap | null;
  default_locale: string | null;
}

export interface TickReport {
  tenants: number;
  sent: number;
  resolved: number;
}

/**
 * Moteur de rappels. Appele chaque minute par /api/cron/reminders avec le
 * client service_role (il lit tous les restaurants: operation de plateforme).
 * Ne leve jamais: une panne d'un restaurant ne bloque pas les autres.
 */
export function createReminderService(supabase: SupabaseClient, deps: { push: ServicePush }) {
  const { alreadySent, sendGroup } = createReminderDelivery(supabase, deps.push);

  async function loadContext() {
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, slug, country, opening_hours, default_locale')
      .eq('is_active', true)
      .is('deleted_at', null)
      .is('suspended_at', null)
      // Le restaurant prive de la plateforme heberge l'administration, pas un service.
      .neq('slug', '__platform');
    if (error) throw error;
    const rows = (tenants ?? []) as TenantRow[];
    const ids = rows.map((t) => t.id);
    if (ids.length === 0) return null;

    const [settingsRes, staffRes, mutesRes] = await Promise.all([
      supabase.from('reminder_settings').select('tenant_id, config').in('tenant_id', ids),
      supabase
        .from('admin_users')
        .select('id, user_id, tenant_id, role')
        .in('tenant_id', ids)
        .eq('is_active', true)
        .is('deleted_at', null),
      supabase
        .from('reminder_preferences')
        .select('admin_user_id, rule')
        .in('tenant_id', ids)
        .eq('muted', true),
    ]);
    if (settingsRes.error) throw settingsRes.error;
    if (staffRes.error) throw staffRes.error;
    if (mutesRes.error) throw mutesRes.error;

    const settings = new Map<string, ReminderSettings>(
      (settingsRes.data ?? []).map((r) => [r.tenant_id as string, parseReminderSettings(r.config)]),
    );
    const staff: StaffMember[] = (staffRes.data ?? []).map((s) => ({
      id: s.id as string,
      userId: (s.user_id as string | null) ?? null,
      tenantId: s.tenant_id as string,
      role: s.role as AdminRole,
    }));
    const muted = new Set((mutesRes.data ?? []).map((m) => `${m.admin_user_id}:${m.rule}`));
    return {
      tenants: new Map(rows.map((t) => [t.id, t])),
      ids,
      settingsOf: (id: string) => settings.get(id) ?? parseReminderSettings(null),
      staff,
      muted,
    };
  }

  async function inBatches<T>(ids: string[], run: (batch: string[]) => Promise<T[]>) {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += ID_BATCH)
      out.push(...(await run(ids.slice(i, i + ID_BATCH))));
    return out;
  }

  async function deleteNotifications(ids: string[]) {
    await inBatches(ids, async (batch) => {
      const { error } = await supabase.from('notifications').delete().in('id', batch);
      if (error) logger.warn('Reminders: notification cleanup failed', { error });
      return [];
    });
  }

  /** Ferme les rappels de service dont le probleme a disparu, et retire leur notification. */
  async function resolveSettled(tenantIds: string[], now: Date): Promise<number> {
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MIN * MINUTE).toISOString();

    // Trop vieux pour etre un probleme de service en cours: quitter la cloche.
    const { data: stale, error: sErr } = await supabase
      .from('reminders')
      .select('id, notification_id')
      .in('tenant_id', tenantIds)
      .in('rule', [...SERVICE_RULES])
      .is('resolved_at', null)
      .not('notification_id', 'is', null)
      .lt('created_at', staleBefore);
    if (sErr) throw sErr;
    if (stale?.length) {
      await deleteNotifications([...new Set(stale.map((r) => r.notification_id as string))]);
    }

    const { data: open, error } = await supabase
      .from('reminders')
      .select('id, rule, subject_key, notification_id')
      .in('tenant_id', tenantIds)
      .in('rule', [...SERVICE_RULES])
      .is('resolved_at', null)
      .gte('created_at', staleBefore);
    if (error) throw error;
    if (!open?.length) return 0;

    // Sujet = "<id commande>" ou "<id commande>@<ready_at>" (un nouveau passage a
    // "prete" est un nouveau sujet: l'ancien rappel est alors regle).
    const orderIds = [...new Set(open.map((r) => (r.subject_key as string).split('@')[0]))];
    const orders = await inBatches(orderIds, async (batch) => {
      const { data, error: oErr } = await supabase
        .from('orders')
        .select('id, status, ready_at')
        .in('id', batch);
      if (oErr) throw oErr;
      return data ?? [];
    });
    const byId = new Map(orders.map((o) => [o.id as string, o]));

    const settled = open.filter((r) => {
      const [id, readyAt] = (r.subject_key as string).split('@');
      const o = byId.get(id);
      if (!o) return true;
      if (r.rule === 'order_ready_not_served') {
        return o.status !== 'ready' || (readyAt !== undefined && o.ready_at !== readyAt);
      }
      return o.status !== 'pending' && o.status !== 'confirmed';
    });
    if (!settled.length) return 0;

    await inBatches(
      settled.map((r) => r.id as string),
      async (batch) => {
        const { error: uErr } = await supabase
          .from('reminders')
          .update({ resolved_at: now.toISOString() })
          .in('id', batch);
        if (uErr) throw uErr;
        return [];
      },
    );

    // Une notification groupee quitte la cloche quand TOUS ses sujets sont regles.
    const stillOpen = new Set(
      open.filter((r) => !settled.includes(r)).map((r) => r.notification_id as string | null),
    );
    const toRemove = [
      ...new Set(settled.map((r) => r.notification_id as string | null).filter(Boolean)),
    ].filter((id) => !stillOpen.has(id)) as string[];
    if (toRemove.length) await deleteNotifications(toRemove);
    return settled.length;
  }

  function groupService(
    dues: DueReminder[],
    ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
  ): ReminderGroup[] {
    const groups = new Map<string, ReminderGroup>();
    for (const d of dues) {
      if (ctx.muted.has(`${d.recipientId}:${d.rule}`)) continue;
      const tenant = ctx.tenants.get(d.tenantId);
      const recipient = ctx.staff.find((s) => s.id === d.recipientId);
      if (!tenant || !recipient) continue;
      const key = `${d.recipientId}:${d.rule}:${d.level}`;
      const settings = ctx.settingsOf(d.tenantId);
      const delay =
        d.rule === 'order_ready_not_served'
          ? settings.ready_not_served_min
          : settings.not_started_min;
      const rule = d.rule as (typeof SERVICE_RULES)[number];
      const level = d.level;
      const locale = localeOf(tenant.default_locale);
      const g = groups.get(key) ?? {
        tenant,
        recipient,
        rule: d.rule,
        level,
        subjects: [],
        message: (labels: string[]) => serviceMessage(rule, level, labels, delay, locale),
      };
      g.subjects.push({ key: d.subjectKey, label: formatRef(d.ref) });
      groups.set(key, g);
    }
    return [...groups.values()];
  }

  return {
    async tick(now: Date): Promise<TickReport> {
      const report: TickReport = { tenants: 0, sent: 0, resolved: 0 };
      try {
        const ctx = await loadContext();
        if (!ctx) return report;
        report.tenants = ctx.ids.length;
        // A part: une panne du menage ne doit pas empecher les nouveaux rappels.
        try {
          report.resolved = await resolveSettled(ctx.ids, now);
        } catch (err) {
          logger.error('Reminders: resolution failed', err);
        }

        const live = new Date(now.getTime() - LIVE_WINDOW_MIN * MINUTE).toISOString();
        const [readyRes, waitingRes, assignRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id, tenant_id, ready_at, server_id, table_id, table_number, order_number')
            .in('tenant_id', ctx.ids)
            .eq('status', 'ready')
            .gte('ready_at', live),
          supabase
            .from('orders')
            .select('id, tenant_id, created_at, table_number, order_number')
            .in('tenant_id', ctx.ids)
            .in('status', ['pending', 'confirmed'])
            .gte('created_at', live),
          supabase
            .from('table_assignments')
            .select('table_id, server_id, started_at')
            .in('tenant_id', ctx.ids)
            .is('ended_at', null)
            .order('started_at', { ascending: true }),
        ]);
        if (readyRes.error) throw readyRes.error;
        if (waitingRes.error) throw waitingRes.error;
        if (assignRes.error) throw assignRes.error;

        // Le plus recent gagne (ordre croissant: la derniere ecriture reste).
        const assigned = new Map<string, string>();
        for (const a of assignRes.data ?? [])
          assigned.set(a.table_id as string, a.server_id as string);

        const dues = [
          ...dueReadyNotServed(
            (readyRes.data ?? []) as ReadyOrder[],
            ctx.settingsOf,
            (tableId) => assigned.get(tableId) ?? null,
            ctx.staff,
            now,
          ),
          ...dueNotStarted(
            (waitingRes.data ?? []) as WaitingOrder[],
            ctx.settingsOf,
            ctx.staff,
            now,
          ),
        ];

        for (const group of groupService(dues, ctx)) {
          try {
            if (await sendGroup(group, now)) report.sent++;
          } catch (err) {
            logger.error('Reminders: service group failed', err, { tenantId: group.tenant.id });
          }
        }

        for (const tenant of ctx.tenants.values()) {
          try {
            report.sent += await scheduled(tenant, ctx, now);
          } catch (err) {
            logger.error('Reminders: scheduled rules failed', err, { tenantId: tenant.id });
          }
        }
      } catch (err) {
        logger.error('Reminders: tick failed', err);
      }
      return report;
    },
  };

  /** Rappels a heure fixe: avant le service, et le bilan du lundi. */
  async function scheduled(
    tenant: TenantRow,
    ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
    now: Date,
  ): Promise<number> {
    const settings = ctx.settingsOf(tenant.id);
    const tz = resolveTenantTimezone(tenant);
    const managers = managersOf(ctx.staff, tenant.id);
    const locale = localeOf(tenant.default_locale);
    let sent = 0;

    const send = async (
      rule: ReminderRule,
      subject: string,
      recipients: StaffMember[],
      message: ReminderMessage,
    ) => {
      for (const recipient of recipients) {
        if (ctx.muted.has(`${recipient.id}:${rule}`)) continue;
        const ok = await sendGroup(
          {
            tenant,
            recipient,
            rule,
            level: 1,
            subjects: [{ key: subject, label: subject }],
            message: () => message,
          },
          now,
        );
        if (ok) sent++;
      }
    };

    const pre = settings.rules.pre_service_stock
      ? preServiceWindow(tenant.opening_hours, tz, now)
      : null;
    if (pre && !(await alreadySent(tenant.id, 'pre_service_stock', pre.ymd))) {
      const facts = await loadStockFacts(supabase, tenant.id);
      if (facts.outOfStock.length || facts.low.length) {
        await send(
          'pre_service_stock',
          pre.ymd,
          managers,
          preServiceMessage(pre.openAt, facts, locale),
        );
      }
    }

    const week = settings.rules.weekly_coach ? weeklyCoachWindow(tz, now) : null;
    if (week && !(await alreadySent(tenant.id, 'weekly_coach', week.ymd))) {
      const facts = await loadCoachFacts(supabase, tenant.id, tz, now);
      if (facts && (facts.peak || facts.dropped.length)) {
        const owners = managers.filter((m) => m.role === 'owner' || m.role === 'admin');
        await send('weekly_coach', week.ymd, owners, coachMessage(facts, locale));
      }
    }
    return sent;
  }
}
