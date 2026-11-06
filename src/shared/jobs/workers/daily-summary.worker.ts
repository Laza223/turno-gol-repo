import type { PgBoss } from 'pg-boss'
import { and, eq, sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { notifications } from '@/shared/db/schema'
import { getHoyData } from '@/modules/home/home.service'
import { addDays, artNowParts } from '@/shared/dates/art'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { enqueueStaffAgendaChange } from '@/modules/notifications/staff-agenda.service'
import { isStaffNotificationsEnabled } from '@/modules/notifications/staff-notification.service'
import { getWeekRevenue } from '@/modules/reports/report.service'
import { buildWeeklySummary, weeklySummaryWeekStart } from '@/modules/reports/weekly-summary'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { CRON_WORK_OPTIONS, QUEUE_DAILY_SUMMARY } from '../definitions'
import { logger } from '@/shared/lib/logger'

const ART_TZ = 'America/Argentina/Buenos_Aires'
const WEEKLY_TRIGGER = 'weekly_summary.sweep'

/** Sin símbolo de moneda — el caller antepone "$" (mismo criterio que
 *  `AdminLatePaymentData.amountArs` en admin-late-payment.ts). */
const arsNumberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
function formatArsNumber(cents: number): string {
  return arsNumberFormatter.format(Math.round(cents) / 100)
}

type SummaryTenant = {
  id: string
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
  dailySummaryEmailOptIn: boolean
  weeklySummaryEmailOptIn: boolean
}

function dateLabelMedium(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const weekday = d
    .toLocaleDateString('es-AR', { weekday: 'short', timeZone: ART_TZ })
    .replace('.', '')
  const day = d.toLocaleDateString('es-AR', { day: 'numeric', timeZone: ART_TZ })
  const month = d.toLocaleDateString('es-AR', { month: 'long', timeZone: ART_TZ })
  return `${weekday} ${day} de ${month}`
}

/**
 * D8 (Fase 2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md §3): resumen
 * diario de AYER (día ya cerrado con certeza, nunca "hoy" — a las 08:00 el día
 * en curso recién empieza). Push siempre (si hay suscripciones); email SOLO
 * opt-in (`tenants.settings.daily_summary_email_opt_in`, default false — el
 * push es gratis, el email tiene costo por tenant×día).
 *
 * Alcance de tenants: `trialing`/`active`/`past_due` — los mismos estados que
 * dejan operar al staff (`BLOCKED_TENANT_STATUSES`/`READ_ONLY_TENANT_STATUSES`
 * en with-tenant.ts excluyen suspended/blocked/churned/deleted/canceled). No
 * tiene sentido mandarle un resumen operativo a un complejo que no puede usar
 * el producto.
 *
 * Reusa getHoyData (mismo agregador que la pantalla en vivo) pasando `date` =
 * AYER — así el resumen y la pantalla "Hoy" nunca pueden divergir en cómo
 * calculan "cobrado"/"ocupación".
 */
export async function runDailySummarySweep(opts?: { scheduled?: boolean }): Promise<void> {
  const sql = getWorkerSql()
  const tenants = await sql<
    Array<{
      id: string
      opening_hours: OpeningHours
      closed_dates: string[] | null
      closes_next_day: boolean
      daily_summary_email_opt_in: boolean | null
      weekly_summary_email_opt_in: boolean | null
    }>
  >`
    SELECT id, opening_hours, closed_dates, closes_next_day,
           (settings->>'daily_summary_email_opt_in')::boolean AS daily_summary_email_opt_in,
           (settings->>'weekly_summary_email_opt_in')::boolean AS weekly_summary_email_opt_in
    FROM tenants
    WHERE status IN ('trialing', 'active', 'past_due')
  `

  const list: SummaryTenant[] = tenants.map((t) => ({
    id: t.id,
    openingHours: t.opening_hours,
    closedDates: t.closed_dates,
    closesNextDay: t.closes_next_day,
    dailySummaryEmailOptIn: t.daily_summary_email_opt_in === true,
    weeklySummaryEmailOptIn: t.weekly_summary_email_opt_in === true,
  }))

  // El tick ahora es por minuto para recuperar agenda y detectar cambios. El
  // legado conserva su horario; el semanal recupera un tick perdido desde08.
  const summaryDue = !opts?.scheduled || artNowParts().time === '08:00'
  const weeklyDue = !opts?.scheduled || artNowParts().time >= '08:00'
  for (const tenant of list) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const v2 = await withTenantContext(tenant.id, (tx) =>
        isStaffNotificationsEnabled(tenant.id, tx),
      )
      if (v2) {
        await withTenantContext(tenant.id, (tx) => enqueueStaffAgendaChange(tenant.id, tx))
      } else if (summaryDue) {
        await sendTenantSummary(tenant)
      }
    } catch (err) {
      logger.warn('daily-summary: failed for tenant', {
        module: 'daily-summary.worker',
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if (!tenant.weeklySummaryEmailOptIn || !weeklyDue) continue
    // try propio: que falle el diario (un push caído) no se lleve puesto el
    // semanal, que no depende de él.
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

async function sendTenantSummary(tenant: SummaryTenant): Promise<void> {
  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const today = operatingDateOf(new Date(), cutoffMins)
  const yesterday = addDays(today, -1)

  const data = await withTenantContext(tenant.id, (tx) =>
    getHoyData(tenant.id, tx, {
      date: yesterday,
      cutoffMins,
      openingHours: tenant.openingHours,
      closedDates: tenant.closedDates,
      closesNextDay: tenant.closesNextDay,
    }),
  )

  const collectedArs = formatArsNumber(data.numbers.collectedTodayCents)
  const occupiedLabel = `${data.numbers.occupancy.occupied}/${data.numbers.occupancy.available}`
  const summaryLabel = `${dateLabelMedium(yesterday)}: $${collectedArs} · ${occupiedLabel}`

  await notifyAdminPush(tenant.id, {
    type: 'daily_summary',
    // `date` (día que resume, no "hoy") es lo que push.service.ts usa para
    // construir la dedupeKey — sin esto un reintento de pg-boss del job
    // push-send duplicaría el resumen visible al admin.
    date: yesterday,
    summaryLabel,
    url: '/dashboard',
  })

  if (tenant.dailySummaryEmailOptIn) {
    // Post-commit dispatch no es necesario: send-email.worker barre 'queued'
    // cada minuto (mismo criterio que dunning-retry.worker, otro cron no
    // latency-sensitive).
    await withTenantContext(tenant.id, (tx) =>
      enqueueTenantOwnerNotification(
        {
          tenantId: tenant.id,
          templateName: 'daily_summary',
          triggerEvent: 'daily_summary.sweep',
          content: {
            dateLabel: dateLabelMedium(yesterday),
            collectedArs,
            occupiedLabel,
          },
        },
        tx,
      ),
    )
  }
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
