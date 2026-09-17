import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// Revisión del PR #326 (docs/audit/2026-09-16-revision-tanda-319-324.md, sección
// "Revisión del PR #326"). El panel de cobro de la grilla usa UNA sola
// clientIdempotencyKey para sus tres modos (adelanto, terminar y cobrar, saldar
// deuda) y sólo la rota cuando un cobro sale bien. Los unit tests mockean la tx,
// así que no pueden ver lo que decide acá: el ON CONFLICT real de cash_flows y el
// orden de los locks. Todo esto exige Postgres.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))

import { requireOperatorStaff } from '@/modules/staff/guards'
import {
  addBookingChargeAction,
  completeAndChargeBookingAction,
} from '@/app/(admin)/reservas/actions'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'

const PRICE = 100_00

async function setup(status: 'confirmed' | 'completed' = 'confirmed') {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const [court] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenant.id}, ${'Cancha Idempotencia'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: PRICE }] })},
      'online'
    )
    RETURNING id
  `
  // Turno ya terminado (2020): pasa el guard de "todavía no terminó" de
  // completeBooking, y también sirve de adelanto porque addBookingChargeAction
  // no mira el horario.
  const [booking] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${tenant.id}, ${court!.id}, ${player.id}, ${'2020-01-01'}::date, ${'10:00'}::time, ${'11:00'}::time,
      ${'2020-01-01 10:00:00-03'}::timestamptz, ${'2020-01-01 11:00:00-03'}::timestamptz,
      ${PRICE}, 0, 'not_required', NULL, ${status}
    )
    RETURNING id
  `
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: staff.id },
    tenant: { id: tenant.id },
  } as never)
  return { sql, tenantId: tenant.id, staffId: staff.id, bookingId: booking!.id }
}

async function caja(bookingId: string): Promise<{ total: number; rows: number }> {
  const [r] = await getSql()<{ total: string; rows: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS rows
    FROM cash_flows WHERE booking_id = ${bookingId}
  `
  return { total: Number(r!.total), rows: Number(r!.rows) }
}

async function bookingStatus(bookingId: string): Promise<string> {
  const [r] = await getSql()<
    { status: string }[]
  >`SELECT status FROM bookings WHERE id = ${bookingId}`
  return r!.status
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('idempotencia de cobros de turno contra Postgres real', () => {
  it('adelanto commiteado + "terminar y cobrar" con la misma key y OTRO monto → rechaza y no completa el turno', async () => {
    const { bookingId } = await setup()
    const key = randomUUID()

    const adelanto = await addBookingChargeAction({
      bookingId,
      charges: [{ amount: 60_00, method: 'cash' }],
      clientIdempotencyKey: key,
    })
    expect(adelanto.success).toBe(true)

    // La respuesta del adelanto se perdió: el panel no rotó la key y, ya
    // terminado el turno, el mostrador cobra el resto.
    const resto = await completeAndChargeBookingAction({
      bookingId,
      charges: [{ amount: 40_00, method: 'cash' }],
      clientIdempotencyKey: key,
    })

    expect(resto.success).toBe(false)
    if (!resto.success) expect(resto.error).toMatch(/ya se había registrado/i)
    expect(await bookingStatus(bookingId)).toBe('confirmed')
    expect(await caja(bookingId)).toEqual({ total: 60_00, rows: 1 })
  })

  it('el MISMO cobro reenviado ya en modo "terminar" completa el turno sin cobrarlo dos veces', async () => {
    const { bookingId } = await setup()
    const key = randomUUID()

    await addBookingChargeAction({
      bookingId,
      charges: [{ amount: 60_00, method: 'cash' }],
      clientIdempotencyKey: key,
    })
    const reenvio = await completeAndChargeBookingAction({
      bookingId,
      charges: [{ amount: 60_00, method: 'cash' }],
      clientIdempotencyKey: key,
    })

    expect(reenvio.success).toBe(true)
    expect(await bookingStatus(bookingId)).toBe('completed')
    expect(await caja(bookingId)).toEqual({ total: 60_00, rows: 1 })
  })

  it('el reintento con otro monto que llega MIENTRAS el primer cobro no commiteó → rechaza, no miente un éxito', async () => {
    const { sql, tenantId, staffId, bookingId } = await setup()
    const key = randomUUID()

    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let lockTaken!: () => void
    const locked = new Promise<void>((r) => (lockTaken = r))

    // El primer request, todavía en vuelo: tiene el lock del turno y ya
    // insertó su línea, pero no commiteó.
    const primero = sql.begin(async (t) => {
      await t`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
      await t`
        INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
          booking_id, registered_by, occurred_at, client_idempotency_key)
        VALUES (${tenantId}, 'income', 'booking', ${60_00}, 'cash', 'Cobro de turno',
          ${bookingId}, ${staffId}, NOW(), ${`${key}-0`})
      `
      lockTaken()
      await gate
    })
    await locked

    const reintento = addBookingChargeAction({
      bookingId,
      charges: [{ amount: 30_00, method: 'cash' }],
      clientIdempotencyKey: key,
    })

    // Esperar a que el reintento quede bloqueado en el lock: para entonces ya
    // pasó por la comparación de contenido y no vio nada commiteado.
    for (let i = 0; i < 200; i++) {
      const [w] = await sql<{ n: string }[]>`
        SELECT COUNT(*)::text AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query ILIKE '%FOR UPDATE%' AND pid <> pg_backend_pid()
      `
      if (Number(w!.n) > 0) break
      await new Promise((r) => setTimeout(r, 25))
    }
    release()
    await primero

    const res = await reintento
    expect(res.success).toBe(false)
    expect(await caja(bookingId)).toEqual({ total: 60_00, rows: 1 })
  })

  it('saldar deuda: reenviar el cobro que ya saldó el turno no se rechaza como "sin saldo"', async () => {
    const { bookingId } = await setup('completed')
    const key = randomUUID()

    const primero = await chargeDebtAction({
      bookingId,
      charges: [{ amount: PRICE, method: 'transfer' }],
      clientIdempotencyKey: key,
    })
    expect(primero.success).toBe(true)

    const reenvio = await chargeDebtAction({
      bookingId,
      charges: [{ amount: PRICE, method: 'transfer' }],
      clientIdempotencyKey: key,
    })

    expect(reenvio.success).toBe(true)
    expect(await caja(bookingId)).toEqual({ total: PRICE, rows: 1 })
  })
})
