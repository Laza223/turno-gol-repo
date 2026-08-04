import type PgBoss from 'pg-boss'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { getHoyData } from '@/modules/home/home.service'
import { addDays } from '@/shared/dates/art'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { CRON_WORK_OPTIONS, QUEUE_DAILY_SUMMARY } from '../definitions'
import { logger } from '@/shared/lib/logger'

const ART_TZ = 'America/Argentina/Buenos_Aires'

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
}

function dateLabelMedium(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const weekday = d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: ART_TZ }).replace('.', '')
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
 * calculan "cobrado"/"ocupación"/"caja cerrada".
 */
export async function runDailySummarySweep(): Promise<void> {
  const sql = getWorkerSql()
  const tenants = await sql<
    Array<{
      id: string
      opening_hours: OpeningHours
      closed_dates: string[] | null
      closes_next_day: boolean
      daily_summary_email_opt_in: boolean | null
    }>
  >`
    SELECT id, opening_hours, closed_dates, closes_next_day,
           (settings->>'daily_summary_email_opt_in')::boolean AS daily_summary_email_opt_in
    FROM tenants
    WHERE status IN ('trialing', 'active', 'past_due')
  `

  const list: SummaryTenant[] = tenants.map((t) => ({
    id: t.id,
    openingHours: t.opening_hours,
    closedDates: t.closed_dates,
    closesNextDay: t.closes_next_day,
    dailySummaryEmailOptIn: t.daily_summary_email_opt_in === true,
  }))

  for (const tenant of list) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await sendTenantSummary(tenant)
    } catch (err) {
      logger.warn('daily-summary: failed for tenant', {
        module: 'daily-summary.worker',
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
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
  const cajaLabel = data.numbers.cashClosed ? 'caja cerrada sin diferencia' : 'caja sin cerrar todavía'
  const summaryLabel = `${dateLabelMedium(yesterday)}: $${collectedArs} · ${occupiedLabel} · ${cajaLabel}`

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
            cashClosed: data.numbers.cashClosed,
          },
        },
        tx,
      ),
    )
  }
}

export async function registerDailySummaryWorker(boss: PgBoss): Promise<void> {
  // 08:00 ART = 11:00 UTC. Mismo horario al que el horario silencioso de push
  // (push-quiet-hours.ts, QUIET_HOURS_END=8) libera cualquier push de
  // madrugada — programar el cron más temprano (ej. 07:00) solo demoraría la
  // entrega real 1 hora sin cambiar nada para el usuario.
  await boss.schedule(QUEUE_DAILY_SUMMARY, '0 11 * * *', {})
  await boss.work(QUEUE_DAILY_SUMMARY, CRON_WORK_OPTIONS, async () => {
    await runDailySummarySweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DAILY_SUMMARY })
}
