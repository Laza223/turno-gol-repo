import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { createAbonado } from '@/modules/abonados/abonado.service'
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
}, 30_000)

afterAll(async () => closeSql())

describe('abonado slot generation vs individual booking on same slot', () => {
  it('individual booking PRE-existing → abonado skips that date as conflict', async () => {
    // Día abonado: Lunes (1). Próximo lunes desde startsOn.
    const startsOn = '2026-10-05' // Monday

    // 1. Crear booking individual en el primer lunes
    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: startsOn,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )

    // 2. Crear abonado lunes 20:00-21:00 a partir del mismo startsOn
    const { slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Test',
          contactPhone: '+5491111111111',
          dayOfWeek: 1, // Monday
          timeStart: '20:00',
          timeEnd: '21:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          endsOn: '2026-11-30',
          paymentMethod: 'cash',
        },
        tx,
      ),
    )

    expect(conflictDates).toContain(startsOn)
    expect(slotsGenerated).toBeGreaterThan(0) // siguientes lunes sí
  }, 30_000)

  it('individual booking + abonado concurrent on same slot → DB exclusion catches collision', async () => {
    const startsOn = '2026-11-02' // Monday

    // Dispatch both concurrent
    const indivPromise = withTenantContext(tenant.id, async (tx) => {
      try {
        await createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date: startsOn,
            timeStart: '14:00',
            timeEnd: '15:00',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        )
        return 'indiv_won' as const
      } catch {
        return 'indiv_lost' as const
      }
    })

    const abonadoPromise = withTenantContext(tenant.id, async (tx) => {
      try {
        const r = await createAbonado(
          tenant.id,
          seed.staffUserId,
          {
            courtId: seed.courtId,
            playerId,
            contactName: 'Conc',
            contactPhone: '+5491122222222',
            dayOfWeek: 1, // Monday
            timeStart: '14:00',
            timeEnd: '15:00',
            pricePerSession: 100000,
            monthlyPrice: 400000,
            startsOn,
            endsOn: '2026-11-30',
            paymentMethod: 'cash',
          },
          tx,
        )
        // Abonado may succeed but with conflictDates IF DB exclusion fires.
        // Or may fail entirely. Both are acceptable outcomes; what's NOT acceptable
        // is having 2 bookings on the same slot.
        return { kind: 'abonado_won' as const, slots: r.slotsGenerated, conflicts: r.conflictDates }
      } catch {
        return { kind: 'abonado_failed' as const }
      }
    })

    await Promise.all([indivPromise, abonadoPromise])

    // Invariant final: ≤ 1 booking activo sobre ese slot
    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${startsOn}::date
        AND time_start = '14:00'::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows[0].c).toBeLessThanOrEqual(1)
  }, 30_000)
})
