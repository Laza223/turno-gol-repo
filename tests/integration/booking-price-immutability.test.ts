import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'

/**
 * Migración 070 — la excepción de reprogramación a la Regla 2 del trigger
 * `enforce_booking_invariants_fn`.
 *
 * El valor de estos tests no es "reprogramar anda": es que la puerta que la 070
 * abrió sea del ancho exacto que se aprobó. La Regla 2 (price_snapshot
 * inmutable) protege contra reescribir a mano lo que ya se le cobró a alguien;
 * si la excepción se ensancha por accidente en una migración futura, el caso
 * "solo el precio, sin mover nada" vuelve a pasar y nadie se entera.
 *
 * Se ejercita el trigger DIRECTO con SQL crudo, sin pasar por la capa app: es
 * el backstop de DB lo que se está verificando, no `rescheduleBooking`.
 */

let tenantId: string
let courtId: string
let otherCourtId: string

const DATE = '2026-09-10'
const OTHER_DATE = '2026-09-11'
const BASE_PRICE = 800000
const NEW_PRICE = 950000

function startsAt(date: string, time: string) {
  return `(${date}::date + '${time}'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'`
}

/** Inserta un booking devolviendo su id. `status` sin castear rompe el enum. */
async function insertBooking(opts: {
  date?: string
  timeStart?: string
  timeEnd?: string
  status?: string
  courtId?: string
}): Promise<string> {
  const sql = getSql()
  const date = opts.date ?? DATE
  const timeStart = opts.timeStart ?? '14:00'
  const timeEnd = opts.timeEnd ?? '15:00'
  const status = opts.status ?? 'confirmed'
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    ) VALUES (
      ${tenantId}, ${opts.courtId ?? courtId}, ${date}, ${timeStart}, ${timeEnd},
      (${date}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${date}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${BASE_PRICE}, 0, 'not_required', NULL, ${status}::booking_status
    )
    RETURNING id
  `
  return rows[0].id
}

async function priceOf(id: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ price_snapshot: number }[]>`
    SELECT price_snapshot FROM bookings WHERE id = ${id}
  `
  return rows[0].price_snapshot
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  courtId = await insertCourt(sql, tenantId)
  otherCourtId = await insertCourt(sql, tenantId)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('migr. 070 — price_snapshot al reprogramar', () => {
  it('permite recalcular el precio cuando el booking confirmado se mueve a otro horario', async () => {
    const sql = getSql()
    const id = await insertBooking({ timeStart: '14:00', timeEnd: '15:00' })

    await sql.unsafe(
      `UPDATE bookings
         SET time_start = '19:00', time_end = '20:00',
             starts_at = ${startsAt(`'${DATE}'`, '19:00')},
             ends_at   = ${startsAt(`'${DATE}'`, '20:00')},
             price_snapshot = ${NEW_PRICE}
       WHERE id = '${id}'`,
    )

    expect(await priceOf(id)).toBe(NEW_PRICE)
  }, 20_000)

  it('permite recalcular el precio cuando se mueve a otra cancha en el mismo horario', async () => {
    const sql = getSql()
    const id = await insertBooking({ timeStart: '16:00', timeEnd: '17:00' })

    await sql`
      UPDATE bookings
         SET court_id = ${otherCourtId}, price_snapshot = ${NEW_PRICE}
       WHERE id = ${id}
    `

    expect(await priceOf(id)).toBe(NEW_PRICE)
  }, 20_000)

  it('permite recalcular el precio cuando se mueve a otro día', async () => {
    const sql = getSql()
    const id = await insertBooking({ timeStart: '17:00', timeEnd: '18:00' })

    await sql.unsafe(
      `UPDATE bookings
         SET date = '${OTHER_DATE}',
             starts_at = ${startsAt(`'${OTHER_DATE}'`, '17:00')},
             ends_at   = ${startsAt(`'${OTHER_DATE}'`, '18:00')},
             price_snapshot = ${NEW_PRICE}
       WHERE id = '${id}'`,
    )

    expect(await priceOf(id)).toBe(NEW_PRICE)
  }, 20_000)

  it('RECHAZA cambiar solo el precio, sin mover el slot (el abuso que la Regla 2 existe para frenar)', async () => {
    const sql = getSql()
    const id = await insertBooking({ timeStart: '20:00', timeEnd: '21:00' })

    await expect(
      sql`UPDATE bookings SET price_snapshot = ${NEW_PRICE} WHERE id = ${id}`,
    ).rejects.toThrow(/price_snapshot es inmutable/)

    expect(await priceOf(id)).toBe(BASE_PRICE)
  }, 20_000)

  it('RECHAZA recalcular el precio de un booking en estado terminal aunque se muevan las columnas del slot', async () => {
    const sql = getSql()
    const id = await insertBooking({ timeStart: '21:00', timeEnd: '22:00', status: 'completed' })

    await expect(
      sql.unsafe(
        `UPDATE bookings
           SET starts_at = ${startsAt(`'${DATE}'`, '22:00')},
               ends_at   = ${startsAt(`'${DATE}'`, '23:00')},
               price_snapshot = ${NEW_PRICE}
         WHERE id = '${id}'`,
      ),
    ).rejects.toThrow(/price_snapshot es inmutable/)

    expect(await priceOf(id)).toBe(BASE_PRICE)
  }, 20_000)

  it('permite recalcular el precio de una reserva todavía esperando seña que se mueve', async () => {
    const sql = getSql()
    const id = await insertBooking({
      date: OTHER_DATE, timeStart: '20:00', timeEnd: '21:00', status: 'pending_payment',
    })

    await sql.unsafe(
      `UPDATE bookings
         SET time_start = '22:00', time_end = '23:00',
             starts_at = ${startsAt(`'${OTHER_DATE}'`, '22:00')},
             ends_at   = ${startsAt(`'${OTHER_DATE}'`, '23:00')},
             price_snapshot = ${NEW_PRICE}
       WHERE id = '${id}'`,
    )

    expect(await priceOf(id)).toBe(NEW_PRICE)
  }, 20_000)

  it('sigue bloqueando cualquier UPDATE sobre un booking terminal (invariante previa intacta)', async () => {
    const sql = getSql()
    const id = await insertBooking({
      date: OTHER_DATE, timeStart: '14:00', timeEnd: '15:00', status: 'canceled_no_refund',
    })

    await expect(
      sql`UPDATE bookings SET notes_internal = 'no deberia entrar' WHERE id = ${id}`,
    ).rejects.toThrow(/estado terminal/)
  }, 20_000)

  it('mover el slot SIN tocar el precio sigue permitido (no se rompió el camino común)', async () => {
    const sql = getSql()
    const id = await insertBooking({ date: OTHER_DATE, timeStart: '16:00', timeEnd: '17:00' })

    await sql.unsafe(
      `UPDATE bookings
         SET time_start = '18:00', time_end = '19:00',
             starts_at = ${startsAt(`'${OTHER_DATE}'`, '18:00')},
             ends_at   = ${startsAt(`'${OTHER_DATE}'`, '19:00')}
       WHERE id = '${id}'`,
    )

    expect(await priceOf(id)).toBe(BASE_PRICE)
  }, 20_000)
})
