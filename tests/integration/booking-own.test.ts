import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeSql, getDb, getSql, type DbTx } from '@/shared/db/client'
import { findOwnLiveBooking } from '@/modules/bookings/booking.own'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

// "¿Este turno ya es MÍO?": lo que evita que el doble envío o la recarga caigan en "Ese turno ya no
// está disponible" cuando el turno ocupado es el propio. Bajo el rol de la app y con la identidad
// del jugador, como `withPlayerContext` en producción: RLS es la segunda barrera.

const DATE = '2099-03-04'

let tenant: { id: string }
let courtId: string
let playerA: { id: string }
let playerB: { id: string }
let confirmedA: string
let pendingA: string
let bookingOfB: string
let rebookedA: string

/** `withPlayerContext` sin el pool de la app: mismo rol (`turnogol_app`) y mismo GUC de identidad. */
function asPlayer<T>(playerId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE turnogol_app`)
    await tx.execute(sql`SELECT set_config('app.current_player_id', ${playerId}, true)`)
    return fn(tx)
  })
}

const slot = (over: { playerId: string; courtId?: string; date?: string; timeStart: string }) => ({
  courtId,
  date: DATE,
  ...over,
})

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenant = await createTestTenant(s)
  courtId = (await seedIsolationData(s, tenant.id)).courtId
  playerA = await createTestPlayer(s)
  playerB = await createTestPlayer(s)
  await linkPlayerToTenant(s, tenant.id, playerA.id)
  await linkPlayerToTenant(s, tenant.id, playerB.id)

  const base = { tenantId: tenant.id, courtId, date: DATE }
  confirmedA = await insertBooking(s, {
    ...base,
    playerId: playerA.id,
    timeStart: '18:00',
    timeEnd: '19:00',
    status: 'confirmed',
  })
  pendingA = await insertBooking(s, {
    ...base,
    playerId: playerA.id,
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
  bookingOfB = await insertBooking(s, {
    ...base,
    playerId: playerB.id,
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
  })
  // Canceló y volvió a reservar la MISMA hora: la cancelada queda en la tabla (más vieja) y la
  // viva es la nueva. Tiene que encontrar la viva, no quedarse con la primera fila del slot.
  await insertBooking(s, {
    ...base,
    playerId: playerA.id,
    timeStart: '08:00',
    timeEnd: '09:00',
    status: 'canceled_refunded',
  })
  rebookedA = await insertBooking(s, {
    ...base,
    playerId: playerA.id,
    timeStart: '08:00',
    timeEnd: '09:00',
    status: 'confirmed',
  })
  // Del propio jugador pero que ya no cuentan como "mi turno".
  for (const [timeStart, timeEnd, status] of [
    ['21:00', '22:00', 'canceled_no_refund'],
    ['22:00', '23:00', 'canceled_refunded'],
    ['16:00', '17:00', 'expired'],
  ] as const) {
    await insertBooking(s, { ...base, playerId: playerA.id, timeStart, timeEnd, status })
  }
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('findOwnLiveBooking', () => {
  it('mi reserva confirmada: la devuelve con su estado', async () => {
    const own = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '18:00' })),
    )
    expect(own).toEqual({ id: confirmedA, status: 'confirmed' })
  })

  it('mi reserva esperando el pago de la seña: también cuenta', async () => {
    const own = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '19:00' })),
    )
    expect(own).toEqual({ id: pendingA, status: 'pending_payment' })
  })

  it('canceló y volvió a reservar la misma hora: devuelve la viva, no la cancelada', async () => {
    const own = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '08:00' })),
    )
    expect(own).toEqual({ id: rebookedA, status: 'confirmed' })
  })

  it('la hora llega como HH:MM o como HH:MM:SS y es el mismo turno', async () => {
    const withSeconds = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '18:00:00' })),
    )
    expect(withSeconds).toEqual({ id: confirmedA, status: 'confirmed' })
  })

  it('el turno de OTRO jugador no es mío: null (filtro explícito)', async () => {
    const own = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '20:00' })),
    )
    expect(own).toBeNull()
  })

  it('aunque el llamador se equivoque de jugador, RLS no deja ver la reserva ajena', async () => {
    // Control: con la identidad correcta, B sí la ve.
    const asB = await asPlayer(playerB.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerB.id, timeStart: '20:00' })),
    )
    expect(asB).toEqual({ id: bookingOfB, status: 'confirmed' })

    // La sesión es de A pero se pregunta por B: el filtro explícito dice "B", RLS dice "solo A".
    const leaked = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerB.id, timeStart: '20:00' })),
    )
    expect(leaked).toBeNull()
  })

  it('sin RLS de por medio (rol que la saltea), el filtro explícito por jugador sigue atajando', async () => {
    // En el entorno de tests la conexión es superusuario: RLS no aplica y el `WHERE player_id` es
    // la única barrera. Es la misma postura que un camino de producción que olvide el contexto.
    const leaked = await getDb().transaction((tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '20:00' })),
    )
    expect(leaked).toBeNull()
    const own = await getDb().transaction((tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '18:00' })),
    )
    expect(own).toEqual({ id: confirmedA, status: 'confirmed' })
  })

  it.each([
    ['cancelada sin devolución', '21:00'],
    ['cancelada con devolución', '22:00'],
    ['vencida', '16:00'],
  ])('mi reserva %s ya no cuenta: null', async (_name, timeStart) => {
    const own = await asPlayer(playerA.id, (tx) =>
      findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart })),
    )
    expect(own).toBeNull()
  })

  it('otra cancha, otro día u otra hora: null', async () => {
    const other = await asPlayer(playerA.id, async (tx) => ({
      hour: await findOwnLiveBooking(tx, slot({ playerId: playerA.id, timeStart: '17:00' })),
      day: await findOwnLiveBooking(
        tx,
        slot({ playerId: playerA.id, timeStart: '18:00', date: '2099-03-05' }),
      ),
      court: await findOwnLiveBooking(
        tx,
        slot({
          playerId: playerA.id,
          timeStart: '18:00',
          courtId: '00000000-0000-4000-8000-000000000999',
        }),
      ),
    }))
    expect(other).toEqual({ hour: null, day: null, court: null })
  })
})
