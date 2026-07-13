import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { physicalRange } from '@/shared/time/physical-range'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-gateway.implementation', () => {
  return {
    MercadoPagoGateway: class {
      constructor(_encryptedAccessToken: string) {}
      createPreference = (...args: Parameters<MockGateway['createPreference']>) =>
        mockGateway.createPreference(...args)
      getPaymentStatus = (...args: Parameters<MockGateway['getPaymentStatus']>) =>
        mockGateway.getPaymentStatus(...args)
      createRefund = (...args: Parameters<MockGateway['createRefund']>) =>
        mockGateway.createRefund(...args)
    },
  }
})

import { cancelByAdmin, cancelByPlayer, type CancellationOutcome } from '@/modules/bookings/booking.cancellation'
import { expirePendingBooking } from '@/modules/bookings/booking.service'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'
import { settleRefund } from '@/modules/payments/payment.service'

/**
 * Turno SIEMPRE a 30 días vista, calculado en cada corrida.
 *
 * Antes era la constante `'2027-09-01'`. Una fecha fija en el futuro no es una
 * fecha estable: la distancia hasta ella se acorta un día por día, así que
 * cualquier assertion que dependa de esa distancia es una bomba de tiempo con la
 * mecha prendida. Esta explotó el 2026-07-11 (ver `setInPolicy`).
 */
const FUTURE_DATE = (() => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 30)
  return d.toISOString().slice(0, 10)
})()

// El valor de la prueba depende de que las 3 transacciones corran en
// conexiones SEPARADAS y choquen en el FOR UPDATE a nivel DB. Con un pool
// chico (DATABASE_POOL_MAX=1) las 3 se serializan en la cola del pool ANTES
// de tocar la DB: el test seguiría verde pero ya no ejercitaría la
// serialización por lock. Espejo de resolvePoolMax() en src/shared/db/client.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Stress'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
  status: 'confirmed' | 'pending_payment'
  depositStatus: string
  depositAmount: number
}): Promise<string> {
  const sql = getSql()
  // Deuda Task 4 (migr. 041 NOT NULL): starts_at/ends_at ahora obligatorios.
  const { startsAt, endsAt } = physicalRange({
    date: FUTURE_DATE,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    physicallyNextDay: false,
  })
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${startsAt.toISOString()}, ${endsAt.toISOString()},
      ${800000}, ${opts.depositAmount}, ${opts.depositStatus}, NULL, ${opts.status}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertApprovedPaymentAndLink(opts: {
  tenantId: string
  bookingId: string
  playerId: string
  amount: number
  mpPaymentId: string
}): Promise<void> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, booking_id, player_id, amount, currency,
      type, method, status, mp_payment_id, processed_at
    )
    VALUES (
      ${opts.tenantId}, ${opts.bookingId}, ${opts.playerId}, ${opts.amount}, 'ARS',
      'deposit', 'mercadopago', 'approved', ${opts.mpPaymentId}, NOW()
    )
    RETURNING id
  `
  await sql`
    UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${rows[0]!.id}
    WHERE id = ${opts.bookingId}
  `
}

async function setInPolicy(tenantId: string): Promise<void> {
  const sql = getSql()
  // `hours_before` es la DISTANCIA DEL DEADLINE, no el largo de la ventana: hay que
  // cancelar con MÁS de `hours_before` de anticipación para que haya reembolso. O sea
  // que un número más grande es una política más DURA (deadline más temprano), no más
  // generosa — que es exactamente para lo que `setOutOfPolicy` usa 20000.
  //
  // Acá decía 9999 con el comentario "always inside the refund window". Al revés:
  // 9999h = 416 días, y el turno de 2027-09-01 dejó de estar a esa distancia el
  // 2026-07-11 — desde ese día el test empezó a fallar solo, sin que nadie tocara
  // nada. Andaba por accidente mientras el calendario lo dejaba.
  //
  // 1 hora: cancelar a 30 días vista está holgadamente adentro. No depende de la fecha.
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: 1, penalty_type: 'deposit', penalty_amount: null } })}
    WHERE id = ${tenantId}
  `
}

async function setOutOfPolicy(tenantId: string): Promise<void> {
  const sql = getSql()
  // 20000 hours before (~833 días) exige cancelar con 833 días de anticipación: el
  // turno está a 30, así que el deadline ya pasó y el jugador queda SIEMPRE fuera de
  // la ventana de reembolso. Este sí tenía la dirección bien (ver `setInPolicy`).
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: 20000, penalty_type: 'deposit', penalty_amount: null } })}
    WHERE id = ${tenantId}
  `
}

async function getBooking(bookingId: string) {
  const sql = getSql()
  const rows = await sql<
    { status: string; deposit_status: string; canceled_by: string | null }[]
  >`
    SELECT status, deposit_status, canceled_by FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!
}

async function countRefundRows(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId} AND type = 'refund'
  `
  return Number(rows[0]!.c)
}

async function countCancelAudits(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM audit_logs
    WHERE resource_id = ${bookingId}
      AND action IN ('booking.canceled', 'booking.canceled_by_admin')
  `
  return Number(rows[0]!.c)
}

// Devuelve las filas de audit de cancelación. countCancelAudits solo prueba que
// haya UNA; esto permite verificar además que el audit superviviente atribuye al
// GANADOR real (acción + actor), no al perdedor de la carrera.
async function getCancelAudits(
  bookingId: string,
): Promise<{ action: string; actor_id: string | null; actor_type: string }[]> {
  const sql = getSql()
  return sql<{ action: string; actor_id: string | null; actor_type: string }[]>`
    SELECT action, actor_id, actor_type FROM audit_logs
    WHERE resource_id = ${bookingId}
      AND action IN ('booking.canceled', 'booking.canceled_by_admin')
  `
}

let tenantId: string
let playerId: string
let staffId: string
let courtId: string
const refundSpy = vi.spyOn(mockGateway, 'createRefund')

beforeAll(async () => {
  // Falla RUIDOSAMENTE si el pool no permite las 3 transacciones simultáneas.
  // Sin esto, un pool de 1 conexión convertiría el test en uno secuencial sin
  // que nadie se entere (falsa seguridad).
  if (EFFECTIVE_POOL_MAX < 3) {
    throw new Error(
      `concurrent-cancellation requiere DATABASE_POOL_MAX>=3 para ejercitar la ` +
        `serialización por FOR UPDATE; valor efectivo=${EFFECTIVE_POOL_MAX}. ` +
        `Con menos conexiones las transacciones se serializan en la cola del pool.`,
    )
  }
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  tenantId = tenant.id
  playerId = player.id
  staffId = staff.id
  courtId = await insertCourt(tenant.id)
  await setInPolicy(tenant.id)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('concurrent cancellation — conditional transition lets exactly one win', () => {
  // admin cancel + player cancel + expiry job fired simultaneously on the SAME
  // confirmed booking. The FOR UPDATE lock serializes the two cancels so exactly
  // one wins; the expiry is a conditional UPDATE on status='pending_payment' and
  // no-ops. No side effect (refund, audit) may run twice. Repeated across rounds
  // to shake out timing-dependent duplicates.
  const ROUNDS = 5

  it(`only one cancellation wins; no duplicate refund/audit (x${ROUNDS})`, async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const hour = String(10 + i).padStart(2, '0')
      const bookingId = await insertBooking({
        tenantId,
        courtId,
        playerId,
        timeStart: `${hour}:00`,
        timeEnd: `${hour}:59`,
        status: 'confirmed',
        depositStatus: 'paid',
        depositAmount: 240_000,
      })
      const mpPaymentId = `mp-stress-${i}-${bookingId.slice(0, 8)}`
      await insertApprovedPaymentAndLink({
        tenantId,
        bookingId,
        playerId,
        amount: 240_000,
        mpPaymentId,
      })

      const [adminRes, playerRes, expiryRes] = await Promise.allSettled([
        withTenantContext(tenantId, (tx) =>
          cancelByAdmin(bookingId, staffId, 'admin cancela', 'complejo', mockGateway, tx),
        ),
        withTenantContext(tenantId, (tx) =>
          cancelByPlayer(bookingId, playerId, 'player cancela', mockGateway, tx),
        ),
        withTenantContext(tenantId, (tx) => expirePendingBooking(bookingId, tx)),
      ])

      // Exactly one of {admin, player} wins; the loser sees a non-confirmed row.
      const cancels = [adminRes, playerRes]
      const winners = cancels.filter((r) => r.status === 'fulfilled')
      const losers = cancels.filter((r) => r.status === 'rejected')
      expect(winners, `round ${i}: exactly one cancel should win`).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        BookingNotInConfirmedError,
      )

      // Expiry is a no-op on a confirmed booking.
      expect(expiryRes.status).toBe('fulfilled')
      if (expiryRes.status === 'fulfilled') {
        expect(expiryRes.value).toEqual({ won: false })
      }

      // caza-bugs #3: cancelByAdmin/cancelByPlayer solo PREPARAN el refund
      // (fila 'pending' durable dentro de la tx) — la llamada a MP la hace el
      // caller después de que la tx commitee. El winner es el único fulfilled.
      const winner = winners[0] as PromiseFulfilledResult<CancellationOutcome>
      expect(winner.value.pendingRefund, `round ${i}: winner prepared a refund`).toBeDefined()
      await settleRefund(winner.value.pendingRefund!, mockGateway, tenantId)

      // Final state is a single, consistent cancellation with a refund.
      const booking = await getBooking(bookingId)
      expect(booking.status).toBe('canceled_refunded')
      expect(booking.deposit_status).toBe('refunded')
      expect(['admin', 'player']).toContain(booking.canceled_by)

      // No duplicated side effects.
      expect(await countRefundRows(bookingId), `round ${i}: one refund row`).toBe(1)
      const refundCallsForThisPayment = refundSpy.mock.calls.filter(
        (c) => c[0] === mpPaymentId,
      ).length
      expect(refundCallsForThisPayment, `round ${i}: gateway refunded once`).toBe(1)

      // El audit superviviente debe atribuir al GANADOR real, no al perdedor:
      // un solo audit, con la acción/actor del que efectivamente canceló. Contar
      // filas no detecta una atribución cruzada bajo contención (p.ej. ganó el
      // player pero quedó registrado como admin).
      const audits = await getCancelAudits(bookingId)
      expect(audits, `round ${i}: exactly one cancel audit`).toHaveLength(1)
      const audit = audits[0]!
      if (booking.canceled_by === 'admin') {
        expect(audit.action, `round ${i}`).toBe('booking.canceled_by_admin')
        expect(audit.actor_type).toBe('staff')
        expect(audit.actor_id).toBe(staffId)
      } else {
        expect(audit.action, `round ${i}`).toBe('booking.canceled')
        expect(audit.actor_type).toBe('player')
        expect(audit.actor_id).toBe(playerId)
      }
    }
  }, 60_000)

  it('on a pending_payment booking, expiry wins and both cancels no-op', async () => {
    const bookingId = await insertBooking({
      tenantId,
      courtId,
      playerId,
      timeStart: '20:00',
      timeEnd: '20:59',
      status: 'pending_payment',
      depositStatus: 'pending',
      depositAmount: 240_000,
    })

    const [adminRes, playerRes, expiryRes] = await Promise.allSettled([
      withTenantContext(tenantId, (tx) =>
        cancelByAdmin(bookingId, staffId, 'admin', 'complejo', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'player', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) => expirePendingBooking(bookingId, tx)),
    ])

    // Neither cancel can act on a non-confirmed booking.
    expect(adminRes.status).toBe('rejected')
    expect(playerRes.status).toBe('rejected')
    expect((adminRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)
    expect((playerRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)

    // Expiry wins the conditional transition.
    expect(expiryRes.status).toBe('fulfilled')
    if (expiryRes.status === 'fulfilled') {
      expect(expiryRes.value.won).toBe(true)
    }

    const booking = await getBooking(bookingId)
    expect(booking.status).toBe('expired')
    // La expiración NO toca la seña: no captura ni reembolsa, queda 'pending'.
    expect(booking.deposit_status).toBe('pending')
    expect(booking.canceled_by).toBeNull()
    expect(await countRefundRows(bookingId)).toBe(0)
    expect(await countCancelAudits(bookingId)).toBe(0)
  }, 30_000)

  it('retry storm sobre booking ya cancelado: cero efectos secundarios duplicados', async () => {
    // Escenario: job pg-boss reintenta + webhook duplicado + doble click del
    // jugador, TODOS contra un booking que YA fue cancelado+reembolsado. El piso
    // de idempotencia: ninguna seña se reembolsa dos veces, ningún audit se
    // duplica, el gateway MP no se vuelve a llamar.
    const bookingId = await insertBooking({
      tenantId,
      courtId,
      playerId,
      timeStart: '15:00',
      timeEnd: '15:59',
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })
    const mpPaymentId = `mp-terminal-${bookingId.slice(0, 8)}`
    await insertApprovedPaymentAndLink({
      tenantId,
      bookingId,
      playerId,
      amount: 240_000,
      mpPaymentId,
    })

    // Cancelación inicial: lleva el booking al estado terminal canceled_refunded.
    const initial = await withTenantContext(tenantId, (tx) =>
      cancelByPlayer(bookingId, playerId, 'cancela primero', mockGateway, tx),
    )
    expect(initial.pendingRefund).toBeDefined()
    await settleRefund(initial.pendingRefund!, mockGateway, tenantId)

    expect((await getBooking(bookingId)).status).toBe('canceled_refunded')
    expect(await countRefundRows(bookingId)).toBe(1)
    expect(await countCancelAudits(bookingId)).toBe(1)
    const refundCallsBefore = refundSpy.mock.calls.filter(
      (c) => c[0] === mpPaymentId,
    ).length
    expect(refundCallsBefore).toBe(1)

    // Tormenta de reintentos sobre el booking ya terminal.
    const [adminRes, playerRes, expiryRes] = await Promise.allSettled([
      withTenantContext(tenantId, (tx) =>
        cancelByAdmin(bookingId, staffId, 'reintento admin', 'complejo', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'reintento player', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) => expirePendingBooking(bookingId, tx)),
    ])

    // Ningún cancel puede actuar sobre un booking no-confirmado.
    expect(adminRes.status).toBe('rejected')
    expect(playerRes.status).toBe('rejected')
    expect((adminRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)
    expect((playerRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)
    expect(expiryRes.status).toBe('fulfilled')
    if (expiryRes.status === 'fulfilled') {
      expect(expiryRes.value).toEqual({ won: false })
    }

    // El estado terminal y sus efectos quedan EXACTAMENTE como tras el 1er cancel.
    const booking = await getBooking(bookingId)
    expect(booking.status).toBe('canceled_refunded')
    expect(booking.deposit_status).toBe('refunded')
    expect(await countRefundRows(bookingId)).toBe(1)
    expect(await countCancelAudits(bookingId)).toBe(1)
    const refundCallsAfter = refundSpy.mock.calls.filter(
      (c) => c[0] === mpPaymentId,
    ).length
    expect(refundCallsAfter, 'el gateway MP no se reembolsó de nuevo').toBe(1)
  }, 30_000)

  it('carrera refund (admin/complejo) vs no-refund (player out-of-policy): el ganador define la seña, el perdedor no filtra', async () => {
    // Tarea #3: el admin que cancela como "complejo" reembolsa SIEMPRE; el
    // jugador fuera de plazo NO reembolsa (seña capturada). Corren a la vez sobre
    // el mismo booking confirmado. Gana uno. Invariante: deposit_status y filas
    // de refund quedan COHERENTES con el ganador; el perdedor no deja efectos a medias.
    await setOutOfPolicy(tenantId)
    try {
      const bookingId = await insertBooking({
        tenantId,
        courtId,
        playerId,
        timeStart: '16:00',
        timeEnd: '16:59',
        status: 'confirmed',
        depositStatus: 'paid',
        depositAmount: 240_000,
      })
      const mpPaymentId = `mp-mixed-${bookingId.slice(0, 8)}`
      await insertApprovedPaymentAndLink({
        tenantId,
        bookingId,
        playerId,
        amount: 240_000,
        mpPaymentId,
      })

      const [adminRes, playerRes] = await Promise.allSettled([
        withTenantContext(tenantId, (tx) =>
          cancelByAdmin(bookingId, staffId, 'complejo con refund', 'complejo', mockGateway, tx),
        ),
        withTenantContext(tenantId, (tx) =>
          cancelByPlayer(bookingId, playerId, 'player sin refund', mockGateway, tx),
        ),
      ])

      // Exactamente uno gana; el otro ve un booking no-confirmado.
      const results = [adminRes, playerRes]
      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<CancellationOutcome> => r.status === 'fulfilled',
      )
      expect(fulfilled).toHaveLength(1)
      const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(loser.reason).toBeInstanceOf(BookingNotInConfirmedError)

      // caza-bugs #3: solo el admin ('complejo' siempre reembolsa) puede haber
      // preparado un refund — el player fuera de plazo no entra a esa rama.
      if (fulfilled[0]!.value.pendingRefund) {
        await settleRefund(fulfilled[0]!.value.pendingRefund, mockGateway, tenantId)
      }

      const booking = await getBooking(bookingId)
      const refundRows = await countRefundRows(bookingId)
      const gatewayCalls = refundSpy.mock.calls.filter((c) => c[0] === mpPaymentId).length
      expect(await countCancelAudits(bookingId), 'un único audit, sin importar quién gane').toBe(1)

      if (booking.canceled_by === 'admin') {
        // Ganó el complejo: seña reembolsada, 1 fila de refund, gateway llamado 1 vez.
        expect(booking.status).toBe('canceled_refunded')
        expect(booking.deposit_status).toBe('refunded')
        expect(refundRows).toBe(1)
        expect(gatewayCalls).toBe(1)
      } else {
        // Ganó el jugador fuera de plazo: seña capturada, sin refund, gateway intacto.
        expect(booking.canceled_by).toBe('player')
        expect(booking.status).toBe('canceled_no_refund')
        expect(booking.deposit_status).toBe('captured')
        expect(refundRows, 'el cancel perdedor no debe dejar una fila de refund').toBe(0)
        expect(gatewayCalls, 'el cancel perdedor no debe llamar al gateway').toBe(0)
      }
    } finally {
      // Restaurar in-policy para los tests siguientes (tenant compartido).
      await setInPolicy(tenantId)
    }
  }, 30_000)

  it('doble-click del jugador (player vs player) colapsa en un solo efecto', async () => {
    // Carrera más común en producción: el jugador toca "cancelar" dos veces y el
    // browser dispara dos requests concurrentes sobre el MISMO booking confirmado.
    // Los tests previos prueban admin-vs-player; este prueba contención del MISMO
    // actor (mismo path cancelByPlayer dos veces). La serialización por FOR UPDATE
    // debe colapsarlas: un refund, un audit (actor=player), gateway llamado 1 vez.
    const bookingId = await insertBooking({
      tenantId,
      courtId,
      playerId,
      timeStart: '17:00',
      timeEnd: '17:59',
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })
    const mpPaymentId = `mp-doubleclick-${bookingId.slice(0, 8)}`
    await insertApprovedPaymentAndLink({
      tenantId,
      bookingId,
      playerId,
      amount: 240_000,
      mpPaymentId,
    })

    const [click1, click2] = await Promise.allSettled([
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'click 1', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'click 2', mockGateway, tx),
      ),
    ])

    // Exactamente uno gana; el doble-click duplicado ve un booking no-confirmado.
    const results = [click1, click2]
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<CancellationOutcome> => r.status === 'fulfilled',
    )
    expect(fulfilled).toHaveLength(1)
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(loser.reason).toBeInstanceOf(BookingNotInConfirmedError)

    expect(fulfilled[0]!.value.pendingRefund).toBeDefined()
    await settleRefund(fulfilled[0]!.value.pendingRefund!, mockGateway, tenantId)

    // Un único estado terminal coherente, con un solo efecto colateral de cada tipo.
    const booking = await getBooking(bookingId)
    expect(booking.status).toBe('canceled_refunded')
    expect(booking.deposit_status).toBe('refunded')
    expect(booking.canceled_by).toBe('player')
    expect(await countRefundRows(bookingId), 'un solo refund pese al doble-click').toBe(1)

    const audits = await getCancelAudits(bookingId)
    expect(audits, 'un solo audit pese al doble-click').toHaveLength(1)
    expect(audits[0]!.action).toBe('booking.canceled')
    expect(audits[0]!.actor_type).toBe('player')
    expect(audits[0]!.actor_id).toBe(playerId)

    const gatewayCalls = refundSpy.mock.calls.filter((c) => c[0] === mpPaymentId).length
    expect(gatewayCalls, 'el gateway MP se llama una sola vez').toBe(1)
  }, 30_000)
})
