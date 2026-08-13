import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, createOnlineBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

// ALCANCE: carrera admin (createManualBooking) × jugador (createOnlineBooking)
// sobre el mismo recurso. La carrera manual×manual vive en
// race-double-booking.test.ts. Lo ÚNICO que sólo este archivo puede ejercitar
// es el path online completo: ban check + balance check + seña en
// pending_payment ocupando el slot. Una reserva manual SIEMPRE queda
// 'confirmed', así que el bloqueo por pending_payment sólo se ve aquí.

// El valor de estas pruebas depende de que las transacciones corran en
// conexiones SEPARADAS y choquen en el FOR UPDATE / la exclusion constraint a
// nivel DB. Con un pool chico (DATABASE_POOL_MAX=1) se serializan en la cola del
// pool ANTES de tocar la DB: el test seguiría verde pero ya no ejercitaría la
// serialización por lock. Espejo de resolvePoolMax() en src/shared/db/client.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string
let court2Id: string

beforeAll(async () => {
  // Seam del timer de expiración: una reserva online con seña queda en
  // pending_payment y arma scheduleBookingExpiry(). Sin este stub se levantaría
  // un pg-boss real que cuelga el teardown.
  setExpiryScheduler(async () => {})

  // Falla RUIDOSAMENTE si el pool no permite concurrencia real. Sin esto, un
  // pool de 1 conexión convierte la carrera en ejecución secuencial sin que
  // nadie se entere (falsa seguridad).
  if (EFFECTIVE_POOL_MAX < 3) {
    throw new Error(
      `race-admin-vs-online requiere DATABASE_POOL_MAX>=3 para ejercitar la ` +
        `serialización por FOR UPDATE entre el path manual y el online; valor ` +
        `efectivo=${EFFECTIVE_POOL_MAX}. Con menos conexiones las transacciones ` +
        `se serializan en la cola del pool.`,
    )
  }

  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
  // Segunda cancha del MISMO tenant para el control negativo de aislamiento
  // por cancha (manual en una, online en la otra → ambas deben ganar).
  court2Id = await insertCourt(sql, tenant.id)
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

type Attempt = { outcome: 'won'; booking: BookingRow } | { outcome: 'lost'; error: unknown }

// Clave del refactor: NO tragamos el tipo de error (el `catch {}` original lo
// descartaba). Lo devolvemos para poder EXIGIR que el rechazo sea SlotTakenError
// y no un 500 cualquiera del path online (notificación, ban, balance, etc.).
function attemptManual(args: {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
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
        },
        tx,
      )
      return { outcome: 'won', booking } as const
    } catch (error) {
      return { outcome: 'lost', error } as const
    }
  })
}

function attemptOnline(args: {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  requiresDeposit?: boolean
  depositPercentage?: number
}): Promise<Attempt> {
  return withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createOnlineBooking(
        tenant.id,
        {
          playerId,
          courtId: args.courtId,
          date: args.date,
          timeStart: args.timeStart,
          timeEnd: args.timeEnd,
          requiresDeposit: args.requiresDeposit ?? false,
          depositPercentage: args.depositPercentage ?? 0,
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

// Fechas relativas a "hoy" (ART, misma fuente que el guard real de
// booking.service.ts) y no literales: un valor fijo como '2026-08-12' es una
// bomba de tiempo — deja de ser "mañana" el día en que deja de ser mañana, y
// el test empieza a fallar con BookingDateOutOfRangeError en vez de medir la
// carrera que dice medir. +1..+5 días entra cómodo en el
// booking_advance_days default (6) y cada test conserva su propio día (no se
// limpian bookings entre `it()`, así que necesitan slots que no choquen).
const raceDay = (n: number): string => addDays(artTodayStr(), n)

describe('race: admin manual booking vs player online booking (same court/slot)', () => {
  it('admin manual y jugador online concurrentes en el mismo slot: exactamente 1 gana y el perdedor recibe SlotTakenError', async () => {
    const date = raceDay(1)
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const results = await Promise.all([
      attemptManual({ courtId: seed.courtId, date, timeStart, timeEnd }),
      attemptOnline({ courtId: seed.courtId, date, timeStart, timeEnd }),
    ])

    const winners = results.filter((r) => r.outcome === 'won')
    const losers = results.filter((r) => r.outcome === 'lost')

    // Invariante central: exactamente un ganador.
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)

    // El ganador (sea admin o jugador) quedó en estado de negocio correcto, no a
    // medias, y sobre la cancha pedida.
    expect(winners[0].outcome === 'won' && winners[0].booking.status).toBe('confirmed')
    expect(winners[0].outcome === 'won' && winners[0].booking.courtId).toBe(seed.courtId)

    // FUERZA: el perdedor falló por "slot ocupado", NO por un error genérico. Sin
    // esto, un bug que rompa el path online y tire un 500 dejaría a admin como
    // único ganador, count===1, y el test pasaría en verde ocultando la regresión.
    expect(losers[0].outcome === 'lost' && losers[0].error).toBeInstanceOf(SlotTakenError)

    expect(await countActiveBookings(seed.courtId, date, timeStart)).toBe(1)
  }, 30_000)

  it('5 intentos manuales + 5 online concurrentes en el mismo slot: exactamente 1 gana y los 9 perdedores reciben SlotTakenError', async () => {
    const date = raceDay(2)
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const attempts: Promise<Attempt>[] = []
    for (let i = 0; i < 5; i++) {
      attempts.push(attemptManual({ courtId: seed.courtId, date, timeStart, timeEnd }))
      attempts.push(attemptOnline({ courtId: seed.courtId, date, timeStart, timeEnd }))
    }
    const results = await Promise.all(attempts)

    const winners = results.filter((r) => r.outcome === 'won')
    const losers = results.filter((r) => r.outcome === 'lost')

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(9)
    expect(winners[0].outcome === 'won' && winners[0].booking.status).toBe('confirmed')

    // Cada uno de los 9 perdedores debe ser SlotTakenError, mezclando ambos
    // paths: 9 de 9 fallaron porque el slot estaba tomado, no por crash.
    for (const loser of losers) {
      expect(loser.outcome === 'lost' && loser.error).toBeInstanceOf(SlotTakenError)
    }

    expect(await countActiveBookings(seed.courtId, date, timeStart)).toBe(1)
  }, 30_000)

  it('una reserva online con seña en pending_payment ocupa el slot y bloquea una reserva manual del admin', async () => {
    const date = raceDay(3)
    const timeStart = '20:00'
    const timeEnd = '21:00'

    // Jugador reserva online con seña: queda en pending_payment (todavía sin
    // pagar) pero YA ocupa el slot por su TTL. Este es el escenario que
    // race-double-booking no puede cubrir: una reserva manual siempre es
    // 'confirmed', nunca pending_payment.
    const online = await attemptOnline({
      courtId: seed.courtId,
      date,
      timeStart,
      timeEnd,
      requiresDeposit: true,
      depositPercentage: 50,
    })
    expect(online.outcome).toBe('won')
    if (online.outcome !== 'won') return
    expect(online.booking.status).toBe('pending_payment')
    expect(online.booking.depositStatus).toBe('pending')
    // La seña se deriva del precio snapshot real (robusto a cambios de pricing).
    expect(online.booking.depositAmount).toBe(Math.round((online.booking.priceSnapshot * 50) / 100))

    // El admin intenta el mismo slot mientras la online sigue impaga: debe perder
    // porque checkOverlap y la exclusion constraint incluyen pending_payment.
    const admin = await attemptManual({ courtId: seed.courtId, date, timeStart, timeEnd })
    expect(admin.outcome).toBe('lost')
    expect(admin.outcome === 'lost' && admin.error).toBeInstanceOf(SlotTakenError)

    // Sobrevive UNA sola fila activa y es la online pendiente de pago.
    const sql = getSql()
    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND time_start = ${timeStart}::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(online.booking.id)
    expect(rows[0].status).toBe('pending_payment')
  }, 30_000)

  it('reserva manual del admin y online del jugador en CANCHAS distintas al mismo horario: ambas tienen éxito (aislamiento por cancha)', async () => {
    const date = raceDay(4)
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const [admin, online] = await Promise.all([
      attemptManual({ courtId: seed.courtId, date, timeStart, timeEnd }),
      attemptOnline({ courtId: court2Id, date, timeStart, timeEnd }),
    ])

    // El lock (FOR UPDATE) y la exclusion constraint son por cancha (court_id
    // WITH =). Si una regresión los volviera globales o por tenant, una de estas
    // dos —en el par mixto manual×online— sería rechazada por error.
    expect(admin.outcome).toBe('won')
    expect(online.outcome).toBe('won')
    expect(await countActiveBookings(seed.courtId, date, timeStart)).toBe(1)
    expect(await countActiveBookings(court2Id, date, timeStart)).toBe(1)
  }, 30_000)

  it('reserva manual off-grid del admin vs online con solape PARCIAL: exactamente 1 gana y la otra recibe SlotTakenError', async () => {
    const date = raceDay(5)

    // Tarea #6: ambos turnos son de 60 min, pero el manual va off-grid (20:30–
    // 21:30) y el online en hora redonda (21:00–22:00). Solapan en [21:00, 21:30).
    // El archivo original sólo probaba slots idénticos; un check que comparara
    // igualdad de time_start/time_end en vez de rango dejaría coexistir estas dos.
    // El solape parcial cruzando manual↔online lo descarta.
    const [admin, online] = await Promise.all([
      attemptManual({ courtId: seed.courtId, date, timeStart: '20:30', timeEnd: '21:30' }),
      attemptOnline({ courtId: seed.courtId, date, timeStart: '21:00', timeEnd: '22:00' }),
    ])

    const results = [admin, online]
    const winners = results.filter((r) => r.outcome === 'won')
    const losers = results.filter((r) => r.outcome === 'lost')

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0].outcome === 'lost' && losers[0].error).toBeInstanceOf(SlotTakenError)

    // Una sola fila activa cubre la franja solapada [21:00, 22:00).
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
