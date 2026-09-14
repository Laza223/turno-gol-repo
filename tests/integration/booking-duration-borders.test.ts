import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, createOnlineBooking } from '@/modules/bookings/booking.service'
import { createManualBookingSchema } from '@/modules/bookings/booking.schema'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertCourt } from '../helpers/factories'

// Lejos en el futuro: nunca choca con `booking_advance_days` ni con "hoy" real.
const FUTURE_DATE = '2099-06-15'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

// Tarea #6: las reservas son de 60 min. Un bloque de 2 horas se modela como
// `block` (mantenimiento), exento de la validación de 60 min, que igual participa
// del exclusion constraint (tsrange) con el resto de las reservas.
describe('booking exclusion constraint: adjacency vs overlap borders', () => {
  it('60min spontaneous + 2h block adyacentes (20:00-21:00 + 21:00-23:00) → ambos permitidos', async () => {
    const date = '2026-09-01'

    const a = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(a.status).toBe('confirmed')

    const b = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '21:00',
          timeEnd: '23:00',
          type: 'block',
          staffUserId: seed.staffUserId,
        },
        tx,
      ),
    )
    expect(b.status).toBe('confirmed')
  }, 30_000)

  it('2h block que solapa un 60min existente (20:00-22:00 luego 21:00-23:00) → segundo rechazado', async () => {
    const date = '2026-09-02'

    await withTenantContext(tenant.id, (tx) =>
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

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart: '21:00',
            timeEnd: '23:00',
            type: 'block',
            staffUserId: seed.staffUserId,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(SlotTakenError)
  }, 30_000)

  it('exact same slot twice → second rejected', async () => {
    const date = '2026-09-03'

    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart: '20:00',
            timeEnd: '21:00',
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(SlotTakenError)
  }, 30_000)

  it('different courts same slot → both allowed', async () => {
    const date = '2026-09-04'
    const sql = getSql()
    const secondCourtId = await insertCourt(sql, tenant.id)

    const a = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(a.status).toBe('confirmed')

    const b = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: secondCourtId,
          date,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(b.status).toBe('confirmed')
  }, 30_000)
})

// Tarea #6 → rediseño 2026-09-14 (alta desde la grilla): la carga manual
// no-`block` ahora admite N horas ENTERAS (evento), la reserva online y la
// reprogramación siguen estrictas en 60, y un `block` nunca carga plata.
describe('Tarea #6 / rediseño 2026-09-14 — horas enteras, online estricta, block sin plata', () => {
  it('permite una reserva spontaneous de 180 min (evento) con precio = suma de franjas', async () => {
    // 2026-09-07 es lunes: franja lun-jue 08:00-18:00 a $8.000/h (default de
    // `insertCourt`, courts.ts). 10/11/12 caen las tres en esa franja.
    const date = '2026-09-07'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '10:00',
          timeEnd: '13:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')
    expect(booking.priceSnapshot).toBe(800000 * 3)
  }, 30_000)

  it('rechaza una reserva spontaneous de 90 min (no es múltiplo de 60)', async () => {
    const date = '2026-09-08'
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart: '10:00',
            timeEnd: '11:30',
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        ),
      ),
    ).rejects.toThrow(/múltiplo/)
  }, 30_000)

  it('la reserva ONLINE sigue exigiendo exactamente 60 min: 120 min rechazado', async () => {
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId,
            courtId: seed.courtId,
            date: FUTURE_DATE,
            timeStart: '10:00',
            timeEnd: '12:00',
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      ),
    ).rejects.toThrow(/60 minutos/)
  }, 30_000)

  it('permite un block de varias horas (mantenimiento)', async () => {
    const date = '2026-09-06'
    const blk = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date,
          timeStart: '08:00',
          timeEnd: '12:00',
          type: 'block',
          staffUserId: seed.staffUserId,
        },
        tx,
      ),
    )
    expect(blk.status).toBe('confirmed')
  }, 30_000)

  // La carga manual (`createManualBooking`, el service) no valida esto por sí
  // sola — la barrera es el schema de la Server Action, que es por donde entra
  // TODO alta manual real. `createManualBookingSchema.safeParse` acá reproduce
  // exactamente ese primer filtro.
  it('un block con seña es rechazado por el schema antes de llegar al service', () => {
    const parsed = createManualBookingSchema.safeParse({
      courtId: seed.courtId,
      date: '2026-09-09',
      timeStart: '08:00',
      timeEnd: '10:00',
      type: 'block',
      staffUserId: seed.staffUserId,
      guestName: 'Mantenimiento',
      depositAmount: 100000,
      depositMethod: 'cash',
      depositStatus: 'paid',
    })
    expect(parsed.success).toBe(false)
  })
})
