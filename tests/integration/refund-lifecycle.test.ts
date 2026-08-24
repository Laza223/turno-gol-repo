import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Ciclo de vida de una devolución de seña, contra base real.
 *
 * Va contra DB y no con mocks porque todo lo que importa acá es de la base: que
 * la deuda quede registrada en `payments` (la fila `bookings` se congela al
 * cancelar, por el trigger de la migr. 070), que el tilde sea idempotente bajo
 * concurrencia, y que la lista del complejo y la etiqueta del staff coincidan
 * con el estado real de esa fila.
 */

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import {
  countPendingRefunds,
  listPendingRefunds,
  markRefundSettled,
} from '@/modules/payments/refund.service'
import { getBookingDetail } from '@/app/(admin)/reservas/queries'
import { remindPendingRefunds } from '@/shared/jobs/workers/retry-refunds.worker'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

const FUTURE_DATE = '2027-07-20'
const DEPOSIT = 240000

/**
 * Reserva confirmada con seña pagada EN EFECTIVO (sin `payment_id`), a más de
 * la ventana de cancelación: cancelarla entra en política y genera devolución.
 *
 * El caso de efectivo es el importante: una seña confirmada a mano no tiene
 * NINGUNA fila en `payments` (`chk_booking_payment_consistency` exige
 * `payment_id IS NULL` para cash/transfer), así que hasta este cambio la deuda
 * de devolución no quedaba registrada en ningún lado.
 */
async function setupConfirmedBookingWithCashDeposit(paymentMethod: 'cash' | 'transfer' = 'cash') {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  // Sin esto el complejo no tiene dueño, y cualquier aviso al dueño se encola
  // en cero destinatarios sin fallar: un test que espere el mail se cae por un
  // motivo que no tiene nada que ver con lo que quiere probar.
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const [{ id: courtId }] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha Devolucion'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `

  const [{ id: bookingId }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${tenant.id}, ${courtId}, ${player.id},
      ${FUTURE_DATE}::date, '20:00'::time, '21:00'::time,
      (${FUTURE_DATE}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      800000, ${DEPOSIT}, 'paid', ${paymentMethod}, 'confirmed'
    )
    RETURNING id
  `

  return { tenantId: tenant.id, bookingId, playerId: player.id, staffUserId: staff.id }
}

async function refundRows(bookingId: string) {
  const sql = getSql()
  return sql<
    { id: string; status: string; amount: number; method: string; processed_at: Date | null }[]
  >`
    SELECT id, status, amount, method, processed_at FROM payments
    WHERE booking_id = ${bookingId} AND type = 'refund'
  `
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(async () => {
  await cleanupAll(getSql())
}, 30_000)

afterAll(async () => closeSql())

describe('devolución de una seña cobrada fuera de MercadoPago', () => {
  it('cancelar deja la deuda registrada y visible para el complejo', async () => {
    const { tenantId, bookingId, playerId } = await setupConfirmedBookingWithCashDeposit()

    await withTenantContext(tenantId, (tx) =>
      cancelByPlayer(bookingId, playerId, 'no puedo ir', tx),
    )

    // Exactamente una fila de refund, con el medio real de la seña. Antes de
    // esto no se creaba ninguna: el complejo debía plata y no había registro.
    const refunds = await refundRows(bookingId)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.status).toBe('pending')
    expect(refunds[0]!.method).toBe('cash')
    expect(refunds[0]!.amount).toBe(DEPOSIT)
    expect(refunds[0]!.processed_at).toBeNull()

    const pending = await withTenantContext(tenantId, (tx) => listPendingRefunds(tenantId, tx))
    expect(pending).toHaveLength(1)
    expect(pending[0]!.amountCents).toBe(DEPOSIT)

    const count = await withTenantContext(tenantId, (tx) => countPendingRefunds(tenantId, tx))
    expect(count).toMatchObject({ count: 1, totalCents: DEPOSIT })
  }, 30_000)

  /**
   * LA regresión que este esfuerzo vino a arreglar: la cancelación deja
   * `deposit_status='refunded'` de entrada, así que el staff leía "Seña
   * reembolsada" sobre plata que seguía en la caja del complejo.
   */
  it('el staff ve "a devolver", no "devuelta", hasta que alguien la salda', async () => {
    const { tenantId, bookingId, playerId, staffUserId } =
      await setupConfirmedBookingWithCashDeposit()

    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))

    const before = await withTenantContext(tenantId, (tx) =>
      getBookingDetail(tenantId, bookingId, tx),
    )
    // El booking dice 'refunded' porque quedó congelado al cancelar; la verdad
    // la tiene `payments`, y es lo que mira la etiqueta.
    expect(before?.depositStatus).toBe('refunded')
    expect(before?.refundState).toBe('pending')

    const [refund] = await refundRows(bookingId)
    await withTenantContext(tenantId, (tx) =>
      markRefundSettled(
        { refundPaymentId: refund!.id, tenantId, method: 'transfer', staffUserId },
        tx,
      ),
    )

    const after = await withTenantContext(tenantId, (tx) =>
      getBookingDetail(tenantId, bookingId, tx),
    )
    expect(after?.refundState).toBe('settled')

    const [settled] = await refundRows(bookingId)
    expect(settled!.status).toBe('approved')
    expect(settled!.method).toBe('transfer')
    expect(settled!.processed_at).not.toBeNull()

    // Y desaparece de la lista del complejo.
    const pending = await withTenantContext(tenantId, (tx) => listPendingRefunds(tenantId, tx))
    expect(pending).toHaveLength(0)
  }, 30_000)

  /** Control negativo: sin devolución en juego, nada de esto se activa. */
  it('una reserva sin devolución no reporta ningún estado de refund', async () => {
    const { tenantId, bookingId } = await setupConfirmedBookingWithCashDeposit()

    const detail = await withTenantContext(tenantId, (tx) =>
      getBookingDetail(tenantId, bookingId, tx),
    )
    expect(detail?.refundState).toBe('none')
  }, 30_000)

  it('deja un audit log con quién saldó, cuánto y por qué medio', async () => {
    const { tenantId, bookingId, playerId, staffUserId } =
      await setupConfirmedBookingWithCashDeposit()
    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))
    const [refund] = await refundRows(bookingId)

    await withTenantContext(tenantId, (tx) =>
      markRefundSettled({ refundPaymentId: refund!.id, tenantId, method: 'cash', staffUserId }, tx),
    )

    const sql = getSql()
    const logs = await sql<{ actor_id: string; metadata: Record<string, unknown> }[]>`
      SELECT actor_id, metadata FROM audit_logs
      WHERE resource_id = ${refund!.id} AND action = 'payment.refund_settled_manually'
    `
    expect(logs).toHaveLength(1)
    expect(logs[0]!.actor_id).toBe(staffUserId)
    expect(logs[0]!.metadata).toMatchObject({ method: 'cash', amount: DEPOSIT })
  }, 30_000)
})

describe('el tilde es idempotente', () => {
  /**
   * Dos personas del staff tildan la misma devolución a la vez. Bajo READ
   * COMMITTED el segundo UPDATE se bloquea en el lock de fila del primero y
   * reevalúa su `WHERE status = 'pending'` contra la versión ya commiteada, así
   * que encuentra 0 filas. Sin eso habría dos audit logs y —peor— dos egresos
   * de caja por la misma plata.
   */
  it('dos tildes concurrentes dejan un solo audit log', async () => {
    const { tenantId, bookingId, playerId, staffUserId } =
      await setupConfirmedBookingWithCashDeposit()
    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))
    const [refund] = await refundRows(bookingId)

    const settle = () =>
      withTenantContext(tenantId, (tx) =>
        markRefundSettled(
          { refundPaymentId: refund!.id, tenantId, method: 'cash', staffUserId },
          tx,
        ),
      )
    const [a, b] = await Promise.all([settle(), settle()])

    // Exactamente uno gana.
    expect([a, b].filter(Boolean)).toHaveLength(1)

    const sql = getSql()
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM audit_logs
      WHERE resource_id = ${refund!.id} AND action = 'payment.refund_settled_manually'
    `
    expect(n).toBe(1)
  }, 30_000)
})

describe('el recordatorio cubre las devoluciones de cualquier medio', () => {
  /**
   * Este pase existia junto a un reintento contra MercadoPago que filtraba por
   * `method`, y ese filtro dejaba a las senias cobradas en efectivo sin ninguna
   * alerta. El reintento se elimino con el reembolso automatico, asi que el
   * recordatorio quedo como el unico aviso: tiene que alcanzar a TODAS.
   */
  it('una devolucion en efectivo de mas de 7 dias dispara el recordatorio', async () => {
    const { tenantId, bookingId, playerId } = await setupConfirmedBookingWithCashDeposit()
    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))

    const sql = getSql()
    await sql`
      UPDATE payments SET created_at = NOW() - INTERVAL '9 days'
      WHERE booking_id = ${bookingId} AND type = 'refund'
    `

    const result = await remindPendingRefunds()
    expect(result.reminded).toBe(1)

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM notifications
      WHERE tenant_id = ${tenantId} AND template_name = 'admin_refund_pending_reminder'
    `
    expect(n).toBe(1)
  }, 30_000)

  it('una devolucion reciente no molesta a nadie', async () => {
    const { tenantId, bookingId, playerId } = await setupConfirmedBookingWithCashDeposit()
    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))

    const result = await remindPendingRefunds()
    expect(result.reminded).toBe(0)
  }, 30_000)
})

/**
 * La lista de `/caja/devoluciones` y el contador del panel tienen que decir lo
 * mismo. Divergían, y la pantalla ofrecía "Ya devolví" sobre una fila que la
 * alerta no contaba. Cualquier filtro que se agregue va en las DOS queries.
 */
describe('lista y contador de devoluciones coinciden', () => {
  async function insertMpRefund(tenantId: string, bookingId: string) {
    const sql = getSql()
    await sql`
      INSERT INTO payments (tenant_id, booking_id, amount, currency, type, method, status)
      VALUES (${tenantId}, ${bookingId}, ${DEPOSIT}, 'ARS', 'refund', 'mercadopago', 'pending')
    `
  }

  /**
   * Hubo una espera de una hora para las devoluciones de MercadoPago, mientras
   * existía el reintento automático: mostrarla antes abría la ventana para que
   * la plata saliera dos veces. Sin ese reintento no hay segunda mano que pueda
   * pagar, así que esconder una hora una deuda que ya existe era solo demorar
   * al complejo.
   */
  it('una devolución de MercadoPago aparece enseguida, sin esperar una hora', async () => {
    const { tenantId, bookingId } = await setupConfirmedBookingWithCashDeposit()
    await insertMpRefund(tenantId, bookingId)

    const listed = await withTenantContext(tenantId, (tx) => listPendingRefunds(tenantId, tx))
    const counted = await withTenantContext(tenantId, (tx) => countPendingRefunds(tenantId, tx))

    expect(listed).toHaveLength(1)
    expect(counted).toMatchObject({ count: 1, totalCents: DEPOSIT })
  }, 30_000)

  it('una devolución que nunca pasó por MercadoPago aparece enseguida en las dos', async () => {
    const { tenantId, bookingId, playerId } = await setupConfirmedBookingWithCashDeposit()
    await withTenantContext(tenantId, (tx) => cancelByPlayer(bookingId, playerId, undefined, tx))

    const listed = await withTenantContext(tenantId, (tx) => listPendingRefunds(tenantId, tx))
    const counted = await withTenantContext(tenantId, (tx) => countPendingRefunds(tenantId, tx))

    expect(listed).toHaveLength(1)
    expect(counted).toMatchObject({ count: 1, totalCents: DEPOSIT })
  }, 30_000)
})
