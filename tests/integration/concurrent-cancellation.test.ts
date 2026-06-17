import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
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

import { cancelByAdmin, cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { expirePendingBooking } from '@/modules/bookings/booking.service'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'

const FUTURE_DATE = '2027-09-01'

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
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }] })},
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
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
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
  // 9999 hours before → the 2027 booking is always inside the refund window.
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: 9999, penalty_type: 'deposit', penalty_amount: null } })}
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
          cancelByAdmin(bookingId, staffId, 'admin cancela', true, mockGateway, tx),
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
        cancelByAdmin(bookingId, staffId, 'admin', true, mockGateway, tx),
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
    await withTenantContext(tenantId, (tx) =>
      cancelByPlayer(bookingId, playerId, 'cancela primero', mockGateway, tx),
    )
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
        cancelByAdmin(bookingId, staffId, 'reintento admin', true, mockGateway, tx),
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

  it('carrera refund (player) vs no-refund (admin): el ganador define la seña, el perdedor no filtra', async () => {
    // admin cancela SIN refund (shouldRefund=false) y player cancela in-policy
    // (CON refund) al mismo tiempo sobre el mismo booking confirmado. Gana uno.
    // Invariante: deposit_status y filas de refund deben ser COHERENTES con el
    // ganador; el perdedor no deja ningún efecto colateral a medias.
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
        cancelByAdmin(bookingId, staffId, 'admin sin refund', false, mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'player con refund', mockGateway, tx),
      ),
    ])

    // Exactamente uno gana; el otro ve un booking no-confirmado.
    const results = [adminRes, playerRes]
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(loser.reason).toBeInstanceOf(BookingNotInConfirmedError)

    const booking = await getBooking(bookingId)
    const refundRows = await countRefundRows(bookingId)
    const gatewayCalls = refundSpy.mock.calls.filter((c) => c[0] === mpPaymentId).length
    expect(await countCancelAudits(bookingId), 'un único audit, sin importar quién gane').toBe(1)

    if (booking.canceled_by === 'player') {
      // Ganó el refund: seña reembolsada, 1 fila de refund, gateway llamado 1 vez.
      expect(booking.status).toBe('canceled_refunded')
      expect(booking.deposit_status).toBe('refunded')
      expect(refundRows).toBe(1)
      expect(gatewayCalls).toBe(1)
    } else {
      // Ganó el no-refund: seña capturada, sin filas de refund, gateway intacto.
      expect(booking.canceled_by).toBe('admin')
      expect(booking.status).toBe('canceled_no_refund')
      expect(booking.deposit_status).toBe('captured')
      expect(refundRows, 'el cancel perdedor no debe dejar una fila de refund').toBe(0)
      expect(gatewayCalls, 'el cancel perdedor no debe llamar al gateway').toBe(0)
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
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(loser.reason).toBeInstanceOf(BookingNotInConfirmedError)

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
