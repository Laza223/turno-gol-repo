import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, releaseBlockBooking } from '@/modules/bookings/booking.service'
import { BookingValidationError } from '@/modules/bookings/booking.errors'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
}, 30_000)

afterAll(async () => closeSql())

async function auditLogsFor(bookingId: string) {
  const sql = getSql()
  return sql<Array<{ action: string; metadata: unknown }>>`
    SELECT action, metadata FROM audit_logs WHERE resource_id = ${bookingId}
  `
}

/**
 * `releaseBlockBooking` (RI G2.1) ejecuta SQL crudo con `tx.execute(sql\`...\`)`,
 * el mismo patrón que `releaseTournamentSlots` — que sí tiene esta cobertura
 * (tests/integration/tournament-slots.test.ts). Sin esto, un error de columna
 * mal escrita o de cast de enum en el DELETE recién se vería en producción: el
 * único test que tocaba esta función en la suite unitaria la mockeaba entera.
 */
describe('releaseBlockBooking', () => {
  it('borra físicamente el bloqueo y deja rastro en audit_logs', async () => {
    const date = '2027-11-05'
    const block = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '20:00',
          timeEnd: '22:00',
          type: 'block',
          staffUserId: seed.staffUserId,
        },
        tx,
      ),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      releaseBlockBooking(tenant.id, block.id, seed.staffUserId, tx),
    )
    expect(result.date).toBe(date)

    const sql = getSql()
    const rows = await sql`SELECT id FROM bookings WHERE id = ${block.id}`
    expect(rows).toHaveLength(0)

    const logs = await auditLogsFor(block.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.action).toBe('booking.block_released')
    expect(logs[0]!.metadata).toMatchObject({ date })
  })

  it('la hora liberada vuelve a estar disponible para una reserva común (DELETE físico, no cancelación)', async () => {
    const date = '2027-11-12'
    const block = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '18:00',
          timeEnd: '19:00',
          type: 'block',
          staffUserId: seed.staffUserId,
        },
        tx,
      ),
    )

    await withTenantContext(tenant.id, (tx) =>
      releaseBlockBooking(tenant.id, block.id, seed.staffUserId, tx),
    )

    // Si el DELETE no fuera físico (p. ej. `canceled_no_refund`), el exclusion
    // constraint seguiría bloqueando esta hora.
    const spontaneous = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '18:00',
          timeEnd: '19:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          guestName: 'Cliente de prueba',
        },
        tx,
      ),
    )
    expect(spontaneous.status).toBe('confirmed')
  })

  it('rechaza liberar una reserva que no es un bloqueo (type=spontaneous)', async () => {
    const date = '2027-11-19'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '10:00',
          timeEnd: '11:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          guestName: 'Cliente de prueba',
        },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        releaseBlockBooking(tenant.id, booking.id, seed.staffUserId, tx),
      ),
    ).rejects.toBeInstanceOf(BookingValidationError)

    const sql = getSql()
    const rows = await sql`SELECT id FROM bookings WHERE id = ${booking.id}`
    expect(rows).toHaveLength(1)
  })

  it('rechaza liberar un bloqueo ya liberado (sin fila que borrar)', async () => {
    const date = '2027-11-26'
    const block = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '09:00',
          timeEnd: '10:00',
          type: 'block',
          staffUserId: seed.staffUserId,
        },
        tx,
      ),
    )

    await withTenantContext(tenant.id, (tx) =>
      releaseBlockBooking(tenant.id, block.id, seed.staffUserId, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        releaseBlockBooking(tenant.id, block.id, seed.staffUserId, tx),
      ),
    ).rejects.toBeInstanceOf(BookingValidationError)
  })

  it('rechaza liberar el bloqueo de otro tenant (aislamiento)', async () => {
    const sql = getSql()
    const otherTenant = await createTestTenant(sql)
    const otherSeed = await seedIsolationData(sql, otherTenant.id)
    const date = '2027-12-03'
    const block = await withTenantContext(otherTenant.id, (tx) =>
      createManualBooking(
        otherTenant.id,
        {
          courtId: otherSeed.courtId,
          date,
          timeStart: '11:00',
          timeEnd: '12:00',
          type: 'block',
          staffUserId: otherSeed.staffUserId,
        },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        releaseBlockBooking(tenant.id, block.id, seed.staffUserId, tx),
      ),
    ).rejects.toBeInstanceOf(BookingValidationError)

    const rows = await sql`SELECT id FROM bookings WHERE id = ${block.id}`
    expect(rows).toHaveLength(1)
  })
})
