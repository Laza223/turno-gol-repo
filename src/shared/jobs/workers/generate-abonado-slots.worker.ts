import type PgBoss from 'pg-boss'
import { getSql } from '@/shared/db/client'
import { generateSlotDates } from '@/modules/abonados/slot-generator'

const JOB_NAME = 'generate-abonado-slots'

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

export async function runRollingSlotGeneration(): Promise<void> {
  const sql = getSql()
  const today = artToday()

  const abonadoRows = await sql<{
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
    closed_dates: string[] | null
  }[]>`
    SELECT a.id, a.tenant_id, a.court_id, a.player_id,
           a.day_of_week, a.time_start, a.time_end,
           a.price_per_session, a.starts_on::text, a.ends_on::text,
           t.status AS tenant_status,
           ARRAY(SELECT (d::date)::text FROM unnest(t.closed_dates) AS d) AS closed_dates
    FROM abonados a
    JOIN tenants t ON t.id = a.tenant_id
    WHERE a.status = 'active'
  `

  const SKIP_STATUSES = new Set([
    'suspended',
    'blocked',
    'canceled',
    'churned',
    'deleted',
  ])

  for (const abonado of abonadoRows) {
    if (SKIP_STATUSES.has(abonado.tenant_status)) continue

    const countRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE abonado_id = ${abonado.id} AND date >= ${today}::date
    `
    const futureCnt = countRows[0]!.n
    if (futureCnt >= 4) continue

    // Find last future booking date to anchor fromDate
    const lastRows = await sql<{ last: string | null }[]>`
      SELECT MAX(date::text) AS last FROM bookings
      WHERE abonado_id = ${abonado.id} AND date >= ${today}::date
    `
    const lastDate = lastRows[0]!.last

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

    let generated = 0
    for (const dateStr of slotDates) {
      const conflictRows = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM bookings
        WHERE court_id = ${abonado.court_id}
          AND date = ${dateStr}::date
          AND status NOT IN ('canceled_refunded','canceled_no_refund')
          AND time_start < ${abonado.time_end}::time
          AND time_end > ${abonado.time_start}::time
      `
      if ((conflictRows[0]!.n) > 0) continue

      await sql`
        INSERT INTO bookings (
          tenant_id, court_id, player_id, abonado_id,
          date, time_start, time_end,
          type, status, price_snapshot, deposit_amount, deposit_status
        ) VALUES (
          ${abonado.tenant_id}, ${abonado.court_id}, ${abonado.player_id ?? null}, ${abonado.id},
          ${dateStr}::date, ${abonado.time_start}::time, ${abonado.time_end}::time,
          'fixed', 'confirmed', ${abonado.price_per_session}, 0, 'not_required'
        )
        ON CONFLICT DO NOTHING
      `
      generated++
    }

    if (generated > 0) {
      console.log(`[generate-abonado-slots] abonado ${abonado.id}: generated ${generated} slots`)
    }
  }
}

export async function registerGenerateAbonadoSlotsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(JOB_NAME, '0 6 * * *', {})
  await boss.work(JOB_NAME, async () => {
    await runRollingSlotGeneration()
  })
  console.log(`[workers] registered ${JOB_NAME}`)
}
