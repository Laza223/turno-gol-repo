import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

/**
 * Pago tardío = reembolso automático (decisión del dueño 2026-08-19,
 * docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md).
 *
 * El caso real (bookings a7a2dca3 y 5ece40d6 en producción, 18-19/08/2026): el
 * jugador abre el checkout, se le vence el hold de 6 minutos, la reserva pasa a
 * `expired` y el slot se libera; DESPUÉS MP acredita el pago. Antes de este
 * cambio quedaba plata cobrada, sin turno, y el único aviso era un mail al
 * complejo pidiendo acción manual.
 *
 * Va contra DB real y no con mocks porque las tres cosas que importan son de la
 * base: que el turno NO se resucite (`expired` es terminal en el trigger), que
 * el intent de reembolso quede commiteado, y que un segundo barrido no genere
 * un segundo reembolso.
 */

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-oauth', async () => {
  const actual = await vi.importActual<typeof import('@/modules/payments/mp-oauth')>(
    '@/modules/payments/mp-oauth',
  )
  return { ...actual, resolveTenantGateway: () => mockGateway }
})

const sendEmailSpy = vi.fn(async (_id: string) => {})
vi.mock('@/modules/notifications/notification.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/modules/notifications/notification.service')
  >('@/modules/notifications/notification.service')
  return {
    ...actual,
    dispatchEmail: async (id: string) => {
      await sendEmailSpy(id)
    },
  }
})

import { reconcilePendingPayments } from '@/shared/jobs/workers/reconcile-pending-payments.worker'
import { getBookingDetail } from '@/app/(admin)/reservas/queries'
import { withTenantContext } from '@/shared/db/client'

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

const FUTURE_DATE = '2027-06-15'
const DEPOSIT = 240000

/**
 * Reserva ya EXPIRADA con checkout de MP arrancado — la huella exacta que busca
 * el segundo pase de `reconcile-pending-payments`. Se inserta directo en
 * `expired`: el trigger `enforce_booking_invariants_fn` bloquea cualquier
 * UPDATE sobre un booking terminal, así que no se puede llegar acá por
 * transición desde el test.
 */
async function setupExpiredBookingWithStartedCheckout() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)

  await sql`UPDATE tenants SET mp_access_token = ${'dummy-encrypted-token'} WHERE id = ${tenant.id}`

  const [{ id: courtId }] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha Tardia'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `

  const [{ id: bookingId }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status,
      created_at, updated_at
    )
    VALUES (
      ${tenant.id}, ${courtId}, ${player.id},
      ${FUTURE_DATE}::date, '20:00'::time, '21:00'::time,
      (${FUTURE_DATE}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      800000, ${DEPOSIT}, 'pending', NULL, 'expired',
      NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '14 minutes'
    )
    RETURNING id
  `

  await sql`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status, mp_preference_id)
    VALUES (
      ${tenant.id}, ${bookingId}, ${player.id},
      ${DEPOSIT}, 'deposit', 'mercadopago', 'pending', ${'pref-' + bookingId}
    )
  `

  return { tenantId: tenant.id, bookingId, playerId: player.id }
}

function approveInMp(bookingId: string, mpPaymentId: string): void {
  mockGateway.searchResults[bookingId] = [
    {
      mpPaymentId,
      status: 'approved',
      amount: DEPOSIT,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    },
  ]
}

async function refundRows(bookingId: string) {
  const sql = getSql()
  return sql<{ id: string; status: string; amount: number; mp_payment_id: string | null }[]>`
    SELECT id, status, amount, mp_payment_id FROM payments
    WHERE booking_id = ${bookingId} AND type = 'refund'
  `
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(() => {
  mockGateway.statusCalls = []
  mockGateway.searchCalls = []
  mockGateway.searchResults = {}
  mockGateway.refundCalls = []
  sendEmailSpy.mockClear()
})

afterAll(async () => closeSql())

describe('pago tardio sobre reserva expirada, reembolso automatico', () => {
  it('reembolsa, avisa al jugador y NO resucita el turno', async () => {
    const { tenantId, bookingId } = await setupExpiredBookingWithStartedCheckout()
    const mpPaymentId = `mp-late-${bookingId.slice(0, 8)}`
    approveInMp(bookingId, mpPaymentId)

    const resolved = await reconcilePendingPayments()
    expect(resolved).toBe(1)

    const sql = getSql()

    // 1. El turno sigue expirado. Es la mitad de la decisión: NO se resucita.
    const [booking] = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(booking!.status).toBe('expired')

    // 2. Se pidió la devolución a MP por el monto completo de la seña, y por eso
    // viaja como reembolso TOTAL (sin `amount`): con monto sería parcial, que MP
    // rechaza con 403 cuando la plata todavía no está liberada. La fila local
    // sigue guardando el importe — se chequea abajo.
    expect(mockGateway.refundCalls).toEqual([{ mpPaymentId }])

    const refunds = await refundRows(bookingId)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.amount).toBe(DEPOSIT)
    // settleRefund la deja 'approved' y le graba el id del refund de MP.
    expect(refunds[0]!.status).toBe('approved')
    expect(refunds[0]!.mp_payment_id).toContain('mp-refund-')

    // 3. Al jugador se le avisa: antes era el único que ponía plata y no
    //    recibía nada.
    const [playerNotif] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM notifications
      WHERE template_name = 'player_late_payment_refunded'
        AND trigger_event = 'payment.late_payment_refunded'
    `
    expect(playerNotif!.c).toBe(1)
    expect(sendEmailSpy).toHaveBeenCalled()

    // 4. El detalle de la reserva deja de mentir "Seña pendiente" (punto 4 de
    //    la decisión). No se puede arreglar poniendo deposit_status='refunded'
    //    —el trigger de estado terminal rechaza el UPDATE—, así que la etiqueta
    //    sale de este flag derivado de `payments`.
    const detail = await withTenantContext(tenantId, (tx) =>
      getBookingDetail(tenantId, bookingId, tx),
    )
    expect(detail?.depositStatus).toBe('pending')
    expect(detail?.depositRefunded).toBe(true)

    // 5. El rastro de auditoría de siempre no se pierde.
    const [audit] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM audit_logs
      WHERE resource_id = ${bookingId} AND action = 'booking.late_payment_attempt'
    `
    expect(audit!.c).toBe(1)
  }, 30_000)

  it('un segundo barrido no genera un segundo reembolso', async () => {
    const { bookingId } = await setupExpiredBookingWithStartedCheckout()
    const mpPaymentId = `mp-late2-${bookingId.slice(0, 8)}`
    approveInMp(bookingId, mpPaymentId)

    await reconcilePendingPayments()
    mockGateway.refundCalls = []
    sendEmailSpy.mockClear()

    await reconcilePendingPayments()

    expect(mockGateway.refundCalls).toEqual([])
    expect(await refundRows(bookingId)).toHaveLength(1)
  }, 30_000)

  it('MP sin pago aprobado, ni reembolso ni aviso (nadie pagó)', async () => {
    const { tenantId, bookingId } = await setupExpiredBookingWithStartedCheckout()
    // searchResults vacío: el caso normal, alguien abandonó el checkout.

    const resolved = await reconcilePendingPayments()
    expect(resolved).toBe(0)
    expect(mockGateway.refundCalls).toEqual([])
    expect(await refundRows(bookingId)).toHaveLength(0)

    // Control negativo del flag de display: sin reembolso sigue en false, o sea
    // el turno sigue diciendo "Seña pendiente", que acá es la verdad.
    const detail = await withTenantContext(tenantId, (tx) =>
      getBookingDetail(tenantId, bookingId, tx),
    )
    expect(detail?.depositRefunded).toBe(false)
  }, 30_000)
})
