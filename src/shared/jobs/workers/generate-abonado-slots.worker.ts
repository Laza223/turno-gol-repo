import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { generateSlotDates } from '@/modules/abonados/slot-generator'
import { slotIsPhysicallyNextDay } from '@/modules/bookings/booking.service'
import { paidPeriodCutoffFrom } from '@/modules/bookings/paid-period.guard'
import { physicalRange } from '@/shared/time/physical-range'
import { logger } from '@/shared/lib/logger'
import { CRON_WORK_OPTIONS } from '../definitions'

const JOB_NAME = 'generate-abonado-slots'

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

export async function runRollingSlotGeneration(): Promise<void> {
  // Cross-tenant scan (Fable 5 P0) — needs the service-role pool, otherwise a
  // restricted app role sees 0 active abonados under RLS. Per-abonado reads
  // and the slot INSERT below run tenant-scoped instead.
  const sql = getWorkerSql()
  const today = artToday()

  const abonadoRows = await sql<
    {
      id: string
      tenant_id: string
      court_id: string
      player_id: string | null
      day_of_week: number
      time_start: string
      time_end: string
      price_per_session: number
      starts_on: string
      ends_on: string | null
      tenant_status: string
      current_period_end: string | null
      closed_dates: string[] | null
    }[]
  >`
    SELECT a.id, a.tenant_id, a.court_id, a.player_id,
           a.day_of_week, a.time_start, a.time_end,
           a.price_per_session, a.starts_on::text, a.ends_on::text,
           t.status AS tenant_status,
           s.current_period_end,
           ARRAY(SELECT (d::date)::text FROM unnest(t.closed_dates) AS d) AS closed_dates
    FROM abonados a
    JOIN tenants t ON t.id = a.tenant_id
    LEFT JOIN tenant_subscriptions s ON s.tenant_id = a.tenant_id
    WHERE a.status = 'active'
  `

  // `canceled` NO está acá (2026-08-20): el complejo dado de baja sigue operando
  // hasta el fin del período que ya pagó, así que sus turnos fijos se le siguen
  // generando — recortados en el corte por `paidPeriodCutoffFrom` más abajo.
  // Antes se lo saltaba entero y los clientes con turno fijo se quedaban sin
  // sesiones desde el día uno de una baja con dos meses pagos por delante.
  const SKIP_STATUSES = new Set(['suspended', 'blocked', 'churned', 'deleted'])

  for (const abonado of abonadoRows) {
    if (SKIP_STATUSES.has(abonado.tenant_status)) continue

    // Tenant is known per-abonado — the reads and the INSERT below run
    // tenant-scoped (Fable 5 P0), not on the service-role pool above.
    const generated = await withTenantContext(abonado.tenant_id, async (tx) => {
      const countRows = await tx.execute(drizzleSql`
        SELECT COUNT(*)::int AS n FROM bookings
        WHERE abonado_id = ${abonado.id} AND date >= ${today}::date
      `)
      const futureCnt = (countRows as unknown as Array<{ n: number }>)[0]!.n
      if (futureCnt >= 4) return 0

      // Find last future booking date to anchor fromDate
      const lastRows = await tx.execute(drizzleSql`
        SELECT MAX(date::text) AS last FROM bookings
        WHERE abonado_id = ${abonado.id} AND date >= ${today}::date
      `)
      const lastDate = (lastRows as unknown as Array<{ last: string | null }>)[0]!.last

      // fromDate = day after last booking (7 days later, same weekday), or today
      let fromDate: string
      if (lastDate) {
        const ms = new Date(`${lastDate}T00:00:00Z`).getTime() + 7 * 86_400_000
        fromDate = new Date(ms).toISOString().slice(0, 10)
      } else {
        fromDate = today
      }

      const closedDates = (abonado.closed_dates ?? []).filter(Boolean)
      const slotDates = generateSlotDates({
        dayOfWeek: abonado.day_of_week,
        startsOn: abonado.starts_on,
        endsOn: abonado.ends_on ?? null,
        fromDate,
        count: 4,
        closedDates,
      })

      const cutoff = paidPeriodCutoffFrom(abonado.tenant_status, abonado.current_period_end)
      const bookableDates = cutoff === null ? slotDates : slotDates.filter((d) => d <= cutoff)

      // Madrugada/día-operativo: mismo cálculo que insertBookingsForSlots
      // (abonado.service.ts) — recurrencia semanal, mismo día calendario en
      // todas las fechas generadas, así que se resuelve una sola vez.
      const physicallyNextDay =
        bookableDates.length > 0
          ? await slotIsPhysicallyNextDay(
              abonado.tenant_id,
              bookableDates[0]!,
              abonado.time_start,
              tx,
            )
          : false

      let count = 0
      for (const dateStr of bookableDates) {
        const conflictRows = await tx.execute(drizzleSql`
          SELECT COUNT(*)::int AS n FROM bookings
          WHERE court_id = ${abonado.court_id}
            AND date = ${dateStr}::date
            AND status NOT IN ('canceled_refunded','canceled_no_refund')
            AND time_start < ${abonado.time_end}::time
            AND time_end > ${abonado.time_start}::time
        `)
        if ((conflictRows as unknown as Array<{ n: number }>)[0]!.n > 0) continue

        const { startsAt, endsAt } = physicalRange({
          date: dateStr,
          timeStart: abonado.time_start,
          timeEnd: abonado.time_end,
          physicallyNextDay,
        })

        await tx.execute(drizzleSql`
          INSERT INTO bookings (
            tenant_id, court_id, player_id, abonado_id,
            date, time_start, time_end,
            starts_at, ends_at,
            type, status, price_snapshot, deposit_amount, deposit_status
          ) VALUES (
            ${abonado.tenant_id}, ${abonado.court_id}, ${abonado.player_id ?? null}, ${abonado.id},
            ${dateStr}::date, ${abonado.time_start}::time, ${abonado.time_end}::time,
            ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
            'fixed', 'confirmed', ${abonado.price_per_session}, 0, 'not_required'
          )
          ON CONFLICT DO NOTHING
        `)
        count++
      }
      return count
    })

    if (generated > 0) {
      logger.info('generated abonado slots', {
        module: 'generate-abonado-slots',
        abonadoId: abonado.id,
        count: generated,
      })
    }
  }
}

export async function registerGenerateAbonadoSlotsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(JOB_NAME, '0 6 * * *', {})
  await boss.work(JOB_NAME, CRON_WORK_OPTIONS, async () => {
    await runRollingSlotGeneration()
  })
  logger.info('registered queue', { module: 'workers', queue: JOB_NAME })
}
