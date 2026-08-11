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
  // Complejo que cierra después de medianoche: apertura 20:00, cierre 02:00.
  await sql`
    UPDATE tenants SET closes_next_day = true,
      opening_hours = ${sql.json({
        mon: { open: '20:00', close: '02:00' },
        tue: { open: '20:00', close: '02:00' },
        wed: { open: '20:00', close: '02:00' },
        thu: { open: '20:00', close: '02:00' },
        fri: { open: '20:00', close: '02:00' },
        sat: { open: '20:00', close: '02:00' },
        sun: { open: '20:00', close: '02:00' },
      })}
    WHERE id = ${tenant.id}
  `
}, 30_000)

afterAll(async () => {
  await closeSql()
})

function attempt(args: { timeStart: string; timeEnd: string; date: string }) {
  return withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: args.date,
          timeStart: args.timeStart,
          timeEnd: args.timeEnd,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
          priceOverride: 800000,
        },
        tx,
      )
      return { outcome: 'won' as const, booking }
    } catch (error) {
      return { outcome: 'lost' as const, error }
    }
  })
}

describe('booking overlap por instante físico (closes_next_day)', () => {
  it('dos slots de madrugada idénticos (01:00–02:00, mismo día operativo) → 1 gana, 1 SlotTakenError', async () => {
    const [a, b] = await Promise.all([
      attempt({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00' }),
      attempt({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00' }),
    ])
    const winners = [a, b].filter((r) => r.outcome === 'won')
    const losers = [a, b].filter((r) => r.outcome === 'lost')
    expect(winners).toHaveLength(1)
    expect(losers[0].outcome === 'lost' && losers[0].error).toBeInstanceOf(SlotTakenError)
  }, 30_000)

  it('slot pre-medianoche 23:00→24:00 y slot madrugada 01:00→02:00 del mismo día operativo NO falsan solape', async () => {
    const [pre, madru] = await Promise.all([
      attempt({ date: '2026-06-16', timeStart: '23:00', timeEnd: '24:00' }),
      attempt({ date: '2026-06-16', timeStart: '01:00', timeEnd: '02:00' }),
    ])
    expect(pre.outcome).toBe('won')
    expect(madru.outcome).toBe('won')
  }, 30_000)
})
