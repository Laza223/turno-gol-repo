import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
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

// Tarea #6: la validación de 60 min en la creación de turnos.
describe('Tarea #6 — sólo turnos de 60 minutos', () => {
  it('rechaza una reserva spontaneous de 120 min', async () => {
    const date = '2026-09-05'
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart: '18:00',
            timeEnd: '20:00',
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
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
})
