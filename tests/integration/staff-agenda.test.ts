import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, withTenantContext } from '@/shared/db/client'
import { enqueueStaffAgendaChange } from '@/modules/notifications/staff-agenda.service'
import { artDateOf } from '@/shared/time/art-date'
import { physicalRange } from '@/shared/time/physical-range'
import { adminSql } from '../helpers/admin-db'
import {
  asApp,
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const date = artDateOf(new Date())
const atHour = (hour: number) => new Date(`${date}T${String(hour + 3).padStart(2, '0')}:00:00Z`)

beforeAll(async () => {
  await adminSql()`SELECT 1`
  await ensureRoles()
  await cleanupAll()
})
afterEach(() => vi.useRealTimers())
afterAll(async () => {
  await closeSql()
})

async function setup() {
  const sql = adminSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id, 'manager')
  await sql`INSERT INTO feature_flags (key, value, tenant_id) VALUES ('staff_notifications_v2', true, ${tenant.id})`
  const courts = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity) VALUES (${tenant.id}, 'Cancha Agenda', 10) RETURNING id
  `
  vi.useFakeTimers({ toFake: ['Date'], now: atHour(8) })
  return { tenantId: tenant.id, courtId: courts[0]!.id }
}

async function addBooking(
  ctx: Awaited<ReturnType<typeof setup>>,
  input: {
    hour: string
    type?: 'spontaneous' | 'fixed' | 'block'
    status?: 'confirmed' | 'pending_payment'
  },
) {
  const starts = Number(input.hour.slice(0, 2))
  const timeEnd = `${String(starts + 1).padStart(2, '0')}:00`
  const { startsAt, endsAt } = physicalRange({
    date,
    timeStart: input.hour,
    timeEnd,
    physicallyNextDay: starts < 8,
  })
  const rows = await adminSql()<{ id: string }[]>`
    INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status)
    VALUES (${ctx.tenantId}, ${ctx.courtId}, ${date}, ${input.hour}, ${timeEnd}, ${startsAt}, ${endsAt},
      ${input.type ?? 'spontaneous'}, ${input.status ?? 'confirmed'}, 0, 0, 'not_required') RETURNING id
  `
  return rows[0]!.id
}

async function agenda(tenantId: string) {
  return asApp(
    tenantId,
    (tx) => tx<{ content: { payload: { title: string; body: string } }; status: string }[]>`
    SELECT content, status FROM notifications WHERE tenant_id = ${tenantId}
      AND channel = 'push' AND trigger_event IN ('agenda.daily','agenda.first_changed') ORDER BY created_at, event_key
  `,
  )
}
const sweep = (tenantId: string) =>
  withTenantContext(tenantId, (tx) => enqueueStaffAgendaChange(tenantId, tx))

describe('agenda — transacción real y rol de aplicación', () => {
  it('dos barridos concurrentes generan una sola agenda vacía, sin email', async () => {
    const { tenantId } = await setup()
    await Promise.all([sweep(tenantId), sweep(tenantId)])
    const rows = await agenda(tenantId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content.payload.title).toBe('Hoy todavía no tenés reservas.')
    const emails = await asApp(
      tenantId,
      (tx) => tx`SELECT id FROM notifications WHERE tenant_id=${tenantId} AND channel='email'`,
    )
    expect(emails).toHaveLength(0)
  })

  it('incluye fijo/gratis y ordena físicamente la madrugada; excluye hold y bloqueo', async () => {
    const ctx = await setup()
    await adminSql()`UPDATE tenants SET closes_next_day=true WHERE id=${ctx.tenantId}`
    await addBooking(ctx, { hour: '17:00', type: 'block' })
    await addBooking(ctx, { hour: '16:00', status: 'pending_payment' })
    await addBooking(ctx, { hour: '01:00' })
    await addBooking(ctx, { hour: '18:00', type: 'fixed' })
    await sweep(ctx.tenantId)
    const rows = await agenda(ctx.tenantId)
    expect(rows[0]!.content.payload.title).toBe('Hoy empezás a las 18:00')
    expect(rows[0]!.content.payload.body).toBe('Cancha Agenda · Tenés 2 reservas.')
  })

  it('el cambio se incorpora al evento principal y deja obsoleta la agenda pendiente', async () => {
    const ctx = await setup()
    await addBooking(ctx, { hour: '18:00' })
    await sweep(ctx.tenantId)
    const suffix = await withTenantContext(ctx.tenantId, async (tx) => {
      await tx.execute(drizzleSql`
        UPDATE bookings SET time_start='17:00', time_end='18:00',
          starts_at=${atHour(17).toISOString()}, ends_at=${atHour(18).toISOString()}
        WHERE tenant_id=${ctx.tenantId}
      `)
      return enqueueStaffAgendaChange(ctx.tenantId, tx, { mergeIntoEventKey: 'booking:confirmed' })
    })
    expect(suffix).toBe('Tu primera reserva pasó a las 17:00')
    await sweep(ctx.tenantId)
    const rows = await agenda(ctx.tenantId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('failed')
  })

  it('no avisa por el avance del reloj después de iniciar la primera reserva', async () => {
    const ctx = await setup()
    await addBooking(ctx, { hour: '18:00' })
    await sweep(ctx.tenantId)
    vi.setSystemTime(atHour(19))
    await sweep(ctx.tenantId)
    await sweep(ctx.tenantId)
    expect(await agenda(ctx.tenantId)).toHaveLength(1)
    const state = await asApp(
      ctx.tenantId,
      (tx) => tx<{ started: boolean }[]>`SELECT started FROM staff_agenda_state`,
    )
    expect(state[0]!.started).toBe(true)
  })

  it('otro tenant no puede leer el snapshot de la agenda', async () => {
    const { tenantId } = await setup()
    await sweep(tenantId)
    const other = await createTestTenant(adminSql())
    const rows = await asApp(
      other.id,
      (tx) => tx`SELECT tenant_id FROM staff_agenda_state WHERE tenant_id=${tenantId}`,
    )
    expect(rows).toHaveLength(0)
  })

  it('antes de las 08 no fija estado ni manda agenda; al volver a las 08 la recupera', async () => {
    const { tenantId } = await setup()
    vi.setSystemTime(atHour(7))
    await sweep(tenantId)
    expect(await agenda(tenantId)).toHaveLength(0)
    vi.setSystemTime(atHour(8))
    await sweep(tenantId)
    expect(await agenda(tenantId)).toHaveLength(1)
  })

  it('el snapshot y el aviso se deshacen juntos si aborta la transacción del evento', async () => {
    const { tenantId } = await setup()
    await expect(
      withTenantContext(tenantId, async (tx) => {
        await enqueueStaffAgendaChange(tenantId, tx)
        throw new Error('rollback de prueba')
      }),
    ).rejects.toThrow('rollback de prueba')
    expect(await agenda(tenantId)).toHaveLength(0)
    await sweep(tenantId)
    expect(await agenda(tenantId)).toHaveLength(1)
  })
})
