import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-21 (hallazgo de ensayo real): la seña cobrada por MercadoPago al
// confirmarse una reserva online no generaba fila en cash_flows, así que el
// reporte de caja del día no la veía. handleApproved (vía dispatchPaymentInfo)
// ahora inserta un cash_flow income/booking/mercadopago DENTRO de la misma tx
// que confirma, SOLO en la rama `won` (el guard existente de
// transitionFromPendingPayment ya impide que una reserva se confirme dos
// veces — un segundo evento MP distinto para el mismo pago debe encontrar
// won=false y NO duplicar el cash_flow).

vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/shared/db/audit', () => ({
  insertSystemAuditLog: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueNotification: vi.fn(),
  enqueueTenantOwnerNotification: vi.fn(async () => ['notif-owner-1']),
}))
vi.mock('@/modules/cashflow/cashflow.service', () => ({
  createCashFlow: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getFirstActiveAdminStaffUserId: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  captureMessage: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { booking: vi.fn(), payment: vi.fn(), webhook: vi.fn() },
}))

import { dispatchPaymentInfo } from '@/modules/payments/payment.service'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'
import { captureMessage } from '@/lib/sentry'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import type { GatewayPaymentInfo } from '@/modules/payments/payment.types'
import type { BookingRow } from '@/modules/bookings/booking.types'

const TENANT_ID = 'tenant-1'
const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_STAFF_ID = 'staff-admin-1'

const info: GatewayPaymentInfo = {
  mpPaymentId: 'mp-1',
  status: 'approved',
  amount: 30_000_00,
  externalReference: BOOKING_ID,
  paymentMethodId: 'visa',
}

function wonBookingRow(): BookingRow {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    courtId: 'court-1',
    playerId: null, // sin jugador vinculado: evita la rama de notificación/ctxRows
    abonadoId: null,
    createdByStaff: null,
    date: new Date('2027-01-01T00:00:00Z'),
    timeStart: '10:00',
    timeEnd: '11:00',
    type: 'spontaneous',
    status: 'confirmed',
    priceSnapshot: 100_00,
    depositAmount: 30_000_00,
    depositStatus: 'paid',
    paymentMethod: 'mercadopago',
    paymentId: 'pay-1',
    notesInternal: null,
    notesPlayer: null,
    guestName: null,
    guestPhone: null,
    canceledReason: null,
    canceledBy: null,
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * tx fake: solo necesita responder a los `tx.execute` que preceden a
 * transitionFromPendingPayment (mockeado aparte, sin tocar tx) dentro de
 * handleApproved — el SELECT del deposit_amount esperado, y el UPDATE de
 * re-link de upsertPaymentRow (se lo hace "exitoso" para que no dispare el
 * INSERT posterior, minimizando la cantidad de calls a mockear).
 */
function mockTx() {
  const execute = vi.fn()
  execute.mockResolvedValueOnce([{ depositAmount: info.amount }]) // depRows
  execute.mockResolvedValueOnce([{ id: 'pay-1' }]) // upsertPaymentRow: relink OK
  return { execute } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFirstActiveAdminStaffUserId).mockResolvedValue(ADMIN_STAFF_ID)
  vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)
})

describe('dispatchPaymentInfo — ENS-21: cash_flow automático de la seña MP', () => {
  it('(d) en la rama won crea un cash_flow income/booking/mercadopago vinculado al booking', async () => {
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({
      won: true,
      row: wonBookingRow(),
    } as never)

    const tx = mockTx()
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('confirmed')

    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      TENANT_ID,
      ADMIN_STAFF_ID,
      expect.objectContaining({
        type: 'income',
        category: 'booking',
        amount: info.amount,
        method: 'mercadopago',
        bookingId: BOOKING_ID,
        description: depositCashFlowDescription(BOOKING_ID),
      }),
      tx,
    )
  })

  it('(e) un segundo evento para el mismo pago (won=false) NO inserta un segundo cash_flow', async () => {
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({ won: false } as never)

    const tx = mockTx()
    // won=false: handleApproved hace una 3ra query (estado actual del booking,
    // ya confirmado por el primer evento) para decidir si registra un intento
    // de pago tardío — no forma parte de lo que este test cubre.
    ;(tx as { execute: ReturnType<typeof vi.fn> }).execute.mockResolvedValueOnce([
      { status: 'confirmed', court_name: 'Cancha 1', date: '2027-01-01' },
    ])
    await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('si la caja del día ya está cerrada, el cash_flow se salta pero la reserva igual confirma y se avisa al dueño', async () => {
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({
      won: true,
      row: wonBookingRow(),
    } as never)
    vi.mocked(createCashFlow).mockRejectedValue(new DayAlreadyClosedError('2027-01-01'))

    const tx = mockTx()
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('confirmed')
    expect(vi.mocked(captureMessage)).toHaveBeenCalled()
    // La plata cobrada fuera de caja no puede quedar invisible: además del
    // warning se encola el aviso al dueño y sus ids viajan en el outcome
    // (el caller los despacha después del commit).
    expect(vi.mocked(enqueueTenantOwnerNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateName: 'admin_deposit_after_close',
        triggerEvent: 'payment.deposit_after_close',
      }),
      tx,
    )
    if (!outcome.alreadyProcessed) expect(outcome.notificationIds).toContain('notif-owner-1')
  })

  it('sin admin activo en el tenant, el cash_flow se salta sin romper la confirmación', async () => {
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({
      won: true,
      row: wonBookingRow(),
    } as never)
    vi.mocked(getFirstActiveAdminStaffUserId).mockResolvedValue(null)

    const tx = mockTx()
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('confirmed')
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
    expect(vi.mocked(captureMessage)).toHaveBeenCalled()
  })

  it('(d) un error inesperado de createCashFlow NO se propaga — la confirmación queda intacta', async () => {
    // Defecto A/1: el cash_flow es reconstruible (la fila `payments` approved
    // ya existe); la confirmación de un pago capturado por MP no lo es. Un
    // error genérico del insert (constraint, timeout, bug) nunca debe voltear
    // la confirmación del booking — se traga con captureMessage.
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({
      won: true,
      row: wonBookingRow(),
    } as never)
    vi.mocked(createCashFlow).mockRejectedValue(new Error('boom'))

    const tx = mockTx()
    const outcome = await dispatchPaymentInfo(info, TENANT_ID, tx)

    expect(outcome.alreadyProcessed).toBe(false)
    if (!outcome.alreadyProcessed) expect(outcome.result).toBe('confirmed')
    expect(vi.mocked(captureMessage)).toHaveBeenCalledWith(
      expect.stringContaining('deposit cash_flow skipped'),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ bookingId: BOOKING_ID, error: 'boom' }),
      }),
    )
  })
})
