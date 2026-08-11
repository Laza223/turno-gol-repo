import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

// NOTA DE ALCANCE: este archivo cubre SOLO la carrera manual×manual (admin vs
// admin) sobre el mismo recurso. La carrera manual-vs-online (admin vs jugador)
// vive en race-admin-vs-online.test.ts, que ejercita createOnlineBooking. El
// título anterior decía "manual vs online" pero el contenido nunca llamaba a
// createOnlineBooking — corregido para que el nombre describa lo que prueba.

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string
let court2Id: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
  // Segunda cancha del MISMO tenant para el control negativo de aislamiento
  // por cancha (dos canchas, mismo slot → ambas deben ganar).
  court2Id = await insertCourt(sql, tenant.id)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

type Attempt = { outcome: 'won'; booking: BookingRow } | { outcome: 'lost'; error: unknown }

/**
 * Lanza un createManualBooking en su propia transacción con tenant context y
 * captura el error sin clasificarlo (clave: NO tragamos el tipo de error —
 * lo devolvemos para que el test pueda exigir que el rechazo sea SlotTakenError
 * y no un 500 cualquiera).
 */
function attemptManualBooking(args: {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  priceOverride?: number
}): Promise<Attempt> {
  return withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createManualBooking(
        tenant.id,
        {
          courtId: args.courtId,
          date: args.date,
          timeStart: args.timeStart,
          timeEnd: args.timeEnd,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
          ...(args.priceOverride !== undefined ? { priceOverride: args.priceOverride } : {}),
        },
        tx,
      )
      return { outcome: 'won', booking } as const
    } catch (error) {
      return { outcome: 'lost', error } as const
    }
  })
}

async function countActiveBookings(
  courtId: string,
  date: string,
  timeStart: string,
): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM bookings
    WHERE court_id = ${courtId}
      AND date = ${date}::date
      AND time_start = ${timeStart}::time
      AND status IN ('pending_payment', 'confirmed')
  `
  return rows[0].c
}

describe('race: double booking — manual bookings concurrentes (mismo court/slot)', () => {
  it('de N intentos concurrentes en el mismo slot, exactamente 1 queda confirmado y cada perdedor es rechazado con SlotTakenError', async () => {
    const date = '2026-06-15'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const N = 10
    const attempts = Array.from({ length: N }, () =>
      attemptManualBooking({ courtId: seed.courtId, date, timeStart, timeEnd }),
    )
    const results = await Promise.all(attempts)

    const winners = results.filter((r) => r.outcome === 'won')
    const losers = results.filter((r) => r.outcome === 'lost')

    // Invariante central: exactamente un ganador.
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(N - 1)

    // El ganador quedó en estado de negocio correcto (confirmado, no un estado
    // a medias), sobre la cancha pedida.
    expect(winners[0].outcome === 'won' && winners[0].booking.status).toBe('confirmed')
    if (winners[0].outcome === 'won') {
      expect(winners[0].booking.courtId).toBe(seed.courtId)
    }

    // FUERZA: cada perdedor falló por "slot ocupado", NO por un error genérico.
    // Sin esto, un refactor que rompa el flujo y tire un 500 en 9 de 10 intentos
    // seguiría dando winners=1 y el test pasaría en verde ocultando la regresión.
    for (const loser of losers) {
      expect(loser.outcome === 'lost' && loser.error).toBeInstanceOf(SlotTakenError)
    }

    // Estado persistido: una sola fila activa para ese court+slot.
    expect(await countActiveBookings(seed.courtId, date, timeStart)).toBe(1)
  }, 30_000)

  it('dos reservas manuales concurrentes en CANCHAS distintas al mismo horario ambas tienen éxito (aislamiento por cancha)', async () => {
    const date = '2026-06-18'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const [a, b] = await Promise.all([
      attemptManualBooking({
        courtId: seed.courtId,
        date,
        timeStart,
        timeEnd,
        priceOverride: 800000,
      }),
      attemptManualBooking({ courtId: court2Id, date, timeStart, timeEnd, priceOverride: 800000 }),
    ])

    // El lock + la exclusion constraint son por cancha (court_id WITH =). Si una
    // regresión los volviera globales, una de estas dos sería rechazada.
    expect(a.outcome).toBe('won')
    expect(b.outcome).toBe('won')
    expect(await countActiveBookings(seed.courtId, date, timeStart)).toBe(1)
    expect(await countActiveBookings(court2Id, date, timeStart)).toBe(1)
  }, 30_000)

  it('dos reservas manuales concurrentes en slots adyacentes NO solapados de la misma cancha ambas tienen éxito (no hay falso solape)', async () => {
    const date = '2026-06-19'

    const [first, second] = await Promise.all([
      attemptManualBooking({
        courtId: seed.courtId,
        date,
        timeStart: '20:00',
        timeEnd: '21:00',
        priceOverride: 800000,
      }),
      attemptManualBooking({
        courtId: seed.courtId,
        date,
        timeStart: '21:00',
        timeEnd: '22:00',
        priceOverride: 800000,
      }),
    ])

    // tsrange es semiabierto [): 21:00 (fin) y 21:00 (inicio) NO solapan. Si la
    // verificación de solape se endureciera a inclusiva o a "misma cancha+fecha",
    // estas reservas back-to-back legítimas serían rechazadas por error.
    expect(first.outcome).toBe('won')
    expect(second.outcome).toBe('won')
    expect(await countActiveBookings(seed.courtId, date, '20:00')).toBe(1)
    expect(await countActiveBookings(seed.courtId, date, '21:00')).toBe(1)
  }, 30_000)

  it('dos reservas de 60 min con solape PARCIAL off-grid → exactamente 1 gana y la otra recibe SlotTakenError', async () => {
    const date = '2026-06-20'

    // Tarea #6: ambos turnos de 60 min. A va off-grid (20:30–21:30) y B en hora
    // redonda (21:00–22:00). Solapan en [21:00, 21:30). El test original solo
    // usaba slots idénticos (solape exacto); un check que comparara igualdad de
    // time_start/time_end en vez de rango dejaría coexistir estas dos y pasaría
    // igual. El solape parcial bajo carrera lo descarta.
    const [a, b] = await Promise.all([
      attemptManualBooking({
        courtId: seed.courtId,
        date,
        timeStart: '20:30',
        timeEnd: '21:30',
        priceOverride: 1500000,
      }),
      attemptManualBooking({
        courtId: seed.courtId,
        date,
        timeStart: '21:00',
        timeEnd: '22:00',
        priceOverride: 800000,
      }),
    ])

    const results = [a, b]
    const winners = results.filter((r) => r.outcome === 'won')
    const losers = results.filter((r) => r.outcome === 'lost')

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0].outcome === 'lost' && losers[0].error).toBeInstanceOf(SlotTakenError)

    // Solo una fila activa cubre la franja solapada [21:00, 22:00).
    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND status IN ('pending_payment', 'confirmed')
        AND tsrange(
              ('2000-01-01'::date + time_start)::timestamp,
              ('2000-01-01'::date + time_end)::timestamp
            ) && tsrange(
              ('2000-01-01'::date + '21:00'::time)::timestamp,
              ('2000-01-01'::date + '22:00'::time)::timestamp
            )
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)
})
