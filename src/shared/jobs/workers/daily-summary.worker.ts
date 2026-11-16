import type { PgBoss } from 'pg-boss'
import { and, eq, sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { notifications } from '@/shared/db/schema'
import { artNowParts } from '@/shared/dates/art'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { enqueueStaffAgendaChange } from '@/modules/notifications/staff-agenda.service'
import { isStaffNotificationsEnabled } from '@/modules/notifications/staff-notification.service'
import { getWeekRevenue } from '@/modules/reports/report.service'
import { buildWeeklySummary, weeklySummaryWeekStart } from '@/modules/reports/weekly-summary'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { CRON_WORK_OPTIONS, QUEUE_DAILY_SUMMARY } from '../definitions'
import { logger } from '@/shared/lib/logger'

const WEEKLY_TRIGGER = 'weekly_summary.sweep'

type SummaryTenant = {
  id: string
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
  weeklySummaryEmailOptIn: boolean
}

/**
 * Barrido por minuto de los avisos programados del complejo:
 * - Agenda de hoy ("Hoy empezás a las X", y si cambia la primera reserva), en el
 *   sistema v2 (`staff_notifications_v2`).
 * - Resumen semanal por mail, opt-in, los lunes.
 *
 * El resumen diario de AYER (push y mail opt-in) se eliminó el 2026-11-16 por
 * decisión del dueño: docs/decisions/2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md.
 * La cola conserva su nombre (`QUEUE_DAILY_SUMMARY`) para no huerfanar el cron
 * ya agendado en pg-boss.
 *
 * Alcance de tenants: `trialing`/`active`/`past_due` — los estados que dejan
 * operar al staff.
 */
export async function runDailySummarySweep(opts?: { scheduled?: boolean }): Promise<void> {
  const sql = getWorkerSql()
  const tenants = await sql<
    Array<{
      id: string
      opening_hours: OpeningHours
      closed_dates: string[] | null
      closes_next_day: boolean
      weekly_summary_email_opt_in: boolean | null
    }>
  >`
    SELECT id, opening_hours, closed_dates, closes_next_day,
           (settings->>'weekly_summary_email_opt_in')::boolean AS weekly_summary_email_opt_in
    FROM tenants
    WHERE status IN ('trialing', 'active', 'past_due')
  `

  const list: SummaryTenant[] = tenants.map((t) => ({
    id: t.id,
    openingHours: t.opening_hours,
    closedDates: t.closed_dates,
    closesNextDay: t.closes_next_day,
    weeklySummaryEmailOptIn: t.weekly_summary_email_opt_in === true,
  }))

  // El tick es por minuto para recuperar la agenda y detectar cambios; el
  // semanal recupera un tick perdido desde las 08.
  const weeklyDue = !opts?.scheduled || artNowParts().time >= '08:00'
  for (const tenant of list) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const v2 = await withTenantContext(tenant.id, (tx) =>
        isStaffNotificationsEnabled(tenant.id, tx),
      )
      if (v2) {
        await withTenantContext(tenant.id, (tx) => enqueueStaffAgendaChange(tenant.id, tx))
      }
    } catch (err) {
      logger.warn('staff-agenda: failed for tenant', {
        module: 'daily-summary.worker',
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if (!tenant.weeklySummaryEmailOptIn || !weeklyDue) continue
    // try propio: que falle la agenda no se lleve puesto el semanal.
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await sendWeeklySummary(tenant)
    } catch (err) {
      logger.warn('weekly-summary: failed for tenant', {
        module: 'daily-summary.worker',
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Resumen semanal por mail: cuelga de este mismo cron (08:00 ART) y de este
 * mismo template en vez de registrar cola y template propios, porque esos
 * registros (`workers/index.ts`, `definitions.ts`, `templates/index.ts`) los
 * comparte RIVAL. Sale solo los lunes (`weeklySummaryWeekStart`) y solo a los
 * administradores: trae lo mismo que Métricas, que el Encargado no ve.
 */
async function sendWeeklySummary(tenant: SummaryTenant): Promise<void> {
  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const weekStart = weeklySummaryWeekStart(operatingDateOf(new Date(), cutoffMins))
  if (!weekStart) return

  const alreadyQueued = async (tx: DbTx) => {
    const rows = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenant.id),
          eq(notifications.triggerEvent, WEEKLY_TRIGGER),
          drizzleSql`(
            ${notifications.content}->>'weekStart' = ${weekStart}
            OR (${notifications.content}->>'weekStart' IS NULL
              AND ${notifications.createdAt} > now() - interval '6 days')
          )`,
        ),
      )
      .limit(1)
    return rows.length > 0
  }
  // El barrido es por minuto: evitar recalcular ingresos si ya quedó encolado.
  if (await withTenantContext(tenant.id, alreadyQueued)) return
  const revenue = await getWeekRevenue(tenant.id, weekStart, cutoffMins)
  // Decisión de Lazar (2026-10-22): una semana sin ingresos no manda mail.
  if (revenue.income <= 0) return
  await withTenantContext(tenant.id, async (tx) => {
    await tx.execute(drizzleSql`
      SELECT pg_advisory_xact_lock(hashtext(${'weekly-summary:' + tenant.id}), hashtext(${weekStart}))
    `)
    if (await alreadyQueued(tx)) return

    await enqueueTenantOwnerNotification(
      {
        tenantId: tenant.id,
        templateName: 'daily_summary',
        triggerEvent: WEEKLY_TRIGGER,
        content: { ...buildWeeklySummary(weekStart, revenue), weekStart },
      },
      tx,
      { onlyRole: 'admin' },
    )
  })
}

export async function registerDailySummaryWorker(boss: PgBoss): Promise<void> {
  // La agenda decide en TX si ya se avisó; reinicios o ticks repetidos no la
  // duplican. No depende de que un proceso esté vivo justo a las 08:00.
  await boss.schedule(QUEUE_DAILY_SUMMARY, '* * * * *', {})
  await boss.work(QUEUE_DAILY_SUMMARY, CRON_WORK_OPTIONS, async () => {
    await runDailySummarySweep({ scheduled: true })
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DAILY_SUMMARY })
}
