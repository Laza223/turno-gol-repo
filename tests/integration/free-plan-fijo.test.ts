import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { isThirdWeekInARow } from '@/modules/bookings/free-plan-fijo'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * "¿Es un fijo?" (freemium v2, docs/planning/2026-11-15-freemium-v2.md) contra
 * Postgres real: el mismo nombre a la misma hora, el mismo día de la semana de
 * las dos semanas anteriores, bajo el contexto del tenant (RLS).
 */

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

// 2027-03-15 es lunes; las dos semanas anteriores, 03-08 y 03-01.
const TODAY = '2027-03-15'

async function insertCourt(tenantId: string, name: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${name}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertGuestTurn(
  tenantId: string,
  courtId: string,
  date: string,
  guestName: string,
  opts: { timeStart?: string; status?: string } = {},
): Promise<void> {
  const start = opts.timeStart ?? '20:00'
  const end = `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`
  await getSql()`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, price_snapshot, deposit_amount, deposit_status, status, guest_name
    ) VALUES (
      ${tenantId}, ${courtId}, ${date}::date, ${start}::time, ${end}::time,
      (${date}::date + ${start}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${date}::date + ${end}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'spontaneous', 0, 0, 'not_required',
      ${opts.status ?? 'confirmed'}::booking_status, ${guestName}
    )
  `
}

async function freeTenant(): Promise<string> {
  const { id } = await createTestTenant()
  await getSql()`UPDATE tenants SET status = 'free'::tenant_status WHERE id = ${id}`
  return id
}

function check(tenantId: string, guestName: string, timeStart = '20:00') {
  return withTenantContext(tenantId, (tx) =>
    isThirdWeekInARow(tenantId, { date: TODAY, timeStart, guestName }, tx),
  )
}

let tenantId: string
let courtA: string
let courtB: string

beforeAll(async () => {
  await ensureRoles()
})

beforeEach(async () => {
  await cleanupAll()
  tenantId = await freeTenant()
  courtA = await insertCourt(tenantId, 'Cancha 1')
  courtB = await insertCourt(tenantId, 'Cancha 2')
})

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('isThirdWeekInARow', () => {
  it('las dos semanas anteriores a la misma hora: es un fijo, aunque cambie la cancha y las mayúsculas', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-03-01', 'Juan Pérez')
    await insertGuestTurn(tenantId, courtB, '2027-03-08', 'juan pérez ')
    expect(await check(tenantId, '  JUAN PÉREZ')).toBe(true)
  })

  it('la cuarta semana seguida ya no avisa: avisó en la tercera', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-02-22', 'Juan Pérez')
    await insertGuestTurn(tenantId, courtA, '2027-03-01', 'Juan Pérez')
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('una sola semana anterior no alcanza', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('las semanas tienen que ser seguidas', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-02-22', 'Juan Pérez')
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('a otra hora no cuenta', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-03-01', 'Juan Pérez', { timeStart: '21:00' })
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('un turno cancelado no cuenta', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-03-01', 'Juan Pérez', {
      status: 'canceled_no_refund',
    })
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('dos turnos la misma semana cuentan como una', async () => {
    await insertGuestTurn(tenantId, courtA, '2027-03-08', 'Juan Pérez')
    await insertGuestTurn(tenantId, courtB, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })

  it('no mira los turnos de otro complejo', async () => {
    const other = await freeTenant()
    const otherCourt = await insertCourt(other, 'Cancha 1')
    await insertGuestTurn(other, otherCourt, '2027-03-01', 'Juan Pérez')
    await insertGuestTurn(other, otherCourt, '2027-03-08', 'Juan Pérez')
    expect(await check(tenantId, 'Juan Pérez')).toBe(false)
  })
})
