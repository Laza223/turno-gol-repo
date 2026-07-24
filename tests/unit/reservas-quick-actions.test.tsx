// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { QuickActions } from '@/app/(admin)/reservas/QuickActions'
import { hasQuickActions } from '@/app/(admin)/reservas/quick-actions-helpers'

// Las Server Actions se inyectan por PROP (no por vi.mock de './actions'):
// QuickActions ya no importa el módulo 'use server' como valor, así que no
// hace falta mockearlo para evitar cargar drizzle.
const confirmDepositMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const completeMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const noShowMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const cancelMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
// Fix chargesTotal real (revisión adversarial): lectura de cobros previos que
// QuickActions fetchea ANTES de abrir CompleteBookingDialog. Default sin
// cobros previos — los tests que necesitan un valor puntual lo overridean con
// mockResolvedValueOnce.
const getBookingChargesMock = vi.fn(async () => ({ ok: true as const, chargesTotal: 0 }))

function booking(overrides: Partial<Parameters<typeof QuickActions>[0]['booking']> = {}) {
  return {
    id: 'b1',
    status: 'confirmed',
    type: 'spontaneous',
    depositStatus: 'not_required',
    depositAmount: 0,
    priceSnapshot: 1500000,
    paymentMethod: null,
    guestName: null,
    guestPhone: null,
    ...overrides,
  }
}

const quickActions = {
  confirmDepositPaymentAction: confirmDepositMock,
  completeAndChargeBookingAction: completeMock as any,
  markNoShowAction: noShowMock,
  cancelBookingAction: cancelMock,
  getBookingChargesAction: getBookingChargesMock,
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('hasQuickActions', () => {
  it('solo pending_payment y confirmed tienen acciones; los bloqueos nunca', () => {
    expect(hasQuickActions({ status: 'pending_payment', type: 'spontaneous' })).toBe(true)
    expect(hasQuickActions({ status: 'confirmed', type: 'fixed' })).toBe(true)
    expect(hasQuickActions({ status: 'confirmed', type: 'block' })).toBe(false)
    expect(hasQuickActions({ status: 'completed', type: 'spontaneous' })).toBe(false)
    expect(hasQuickActions({ status: 'canceled_no_refund', type: 'spontaneous' })).toBe(false)
  })
})

describe('QuickActions — confirmar pago con picker de método', () => {
  it('pending_payment: click en Confirmar pago abre el picker con Efectivo preseleccionado y confirma', async () => {
    render(
      <QuickActions
        booking={booking({ status: 'pending_payment', depositStatus: 'pending', depositAmount: 500000 })}
        label="Juan Pérez · 14:00–15:00"
        {...quickActions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Efectivo' })).toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(confirmDepositMock).toHaveBeenCalledWith('b1', 'cash'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pago confirmado', variant: 'success' }),
    )
  })

  it('permite elegir Transferencia u Otro antes de confirmar', async () => {
    render(
      <QuickActions
        booking={booking({ status: 'pending_payment', depositStatus: 'pending', depositAmount: 500000 })}
        label="Juan Pérez · 14:00–15:00"
        {...quickActions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Transferencia' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(confirmDepositMock).toHaveBeenCalledWith('b1', 'transfer'))
  })

  it('si la action falla, el error aparece inline en el diálogo y NO refresca', async () => {
    confirmDepositMock.mockResolvedValueOnce({
      success: false,
      error: 'La reserva ya no está pendiente de pago (pudo confirmarse o expirar).',
    } as never)
    render(
      <QuickActions booking={booking({ status: 'pending_payment' })} label="Juan · 14:00" {...quickActions} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'La reserva ya no está pendiente de pago (pudo confirmarse o expirar).',
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('QuickActions — confirmed', () => {
  it('muestra Completada / Ausente / Cancelar inline', () => {
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)
    expect(screen.getByRole('button', { name: 'Completada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ausente' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
  })

  /**
   * Fix chargesTotal real (revisión adversarial): antes, "Completada" abría
   * CompleteBookingDialog con `chargesTotal: 0` hardcodeado — si el turno ya
   * tenía cobros de mostrador previos, el saldo pendiente se mostraba
   * INFLADO (sumaba de nuevo lo que ya se había cobrado). Ahora fetchea
   * `getBookingChargesAction` antes de abrir y el diálogo arranca con el
   * saldo real: priceSnapshot (1.500.000) − cobros previos (500.000) = pendiente
   * de 1.000.000 ($10.000), no de 1.500.000 ($15.000).
   */
  it('Completada fetchea los cobros reales y abre el diálogo con el saldo pendiente correcto', async () => {
    getBookingChargesMock.mockResolvedValueOnce({ ok: true, chargesTotal: 500000 })
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Completada' }))

    await waitFor(() => expect(getBookingChargesMock).toHaveBeenCalledWith('b1'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Completar turno')).toBeTruthy()
    // "Cobros previos" solo se muestra cuando chargesTotal > 0 (CompleteBookingDialog).
    expect(within(dialog).getByText('Cobros previos')).toBeTruthy()
    // Saldo a cobrar = precio (1.500.000) − cobros previos (500.000) =
    // 1.000.000 ($10.000). Con el bug (chargesTotal:0 hardcodeado) esta fila
    // mostraba $15.000 — el precio COMPLETO como si nada se hubiera cobrado.
    const saldoRow = within(dialog).getByText('Saldo a cobrar').closest('div')
    expect(saldoRow).toHaveTextContent('$ 10.000')
    expect(saldoRow).not.toHaveTextContent('$ 15.000')
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('si getBookingChargesAction falla, abre igual con chargesTotal=0 (fail-open — el server re-valida al cobrar)', async () => {
    getBookingChargesMock.mockResolvedValueOnce({ ok: false, error: 'boom' } as never)
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Completada' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Cobros previos')).toBeNull()
  })

  it('sin getBookingChargesAction (prop opcional), abre directo con chargesTotal=0', async () => {
    render(
      <QuickActions
        booking={booking()}
        label="Juan · 14:00"
        {...quickActions}
        getBookingChargesAction={undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Completada' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(getBookingChargesMock).not.toHaveBeenCalled()
  })

  it('Ausente pide confirmación en dos pasos (sin modal)', async () => {
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ausente' }))
    expect(noShowMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '¿Confirmar ausente?' }))
    await waitFor(() => expect(noShowMock).toHaveBeenCalledWith('b1'))
  })

  it('Cancelar abre diálogo, exige elegir quién cancela y motivo de 3+ caracteres', async () => {
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()

    // findByRole y no getByRole en los clicks del confirm: React 19 hizo las
    // transiciones async de verdad, así que el botón se queda en "Procesando…"
    // un tick más de lo que se quedaba en React 18. findByRole reintenta hasta
    // que vuelve a estar idle; getByRole miraba una sola vez y no lo encontraba.
    // Sin elegir quién cancela ni motivo → error, no dispara la action.
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(cancelMock).not.toHaveBeenCalled()

    // Paso 1: el jugador pidió cancelar (0 = complejo, 1 = jugador).
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[1]!)

    // Motivo todavía vacío → sigue exigiendo motivo.
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }))
    expect(cancelMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Motivo (obligatorio)'), {
      target: { value: 'Lluvia torrencial' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() =>
      expect(cancelMock).toHaveBeenCalledWith('b1', 'Lluvia torrencial', 'jugador'),
    )
  })

  it('el menú contextual mobile existe con aria-label descriptivo', () => {
    render(<QuickActions booking={booking()} label="Juan · 14:00" {...quickActions} />)
    expect(screen.getByRole('button', { name: 'Acciones para Juan · 14:00' })).toBeTruthy()
  })
})

/**
 * Clase de B3: `decideAdminRefund` (backend) nunca reembolsa un turno YA
 * TERMINADO, ni para 'complejo'. Antes de este fix, el warning para
 * 'complejo' decía "Se reembolsará…" de forma incondicional (líneas
 * 146-150), sin mirar si el turno ya se jugó.
 */
describe('QuickActions — turno ya terminado nunca promete reembolso (clase B3)', () => {
  it('booking.endsAt en el pasado + complejo: warning dice "sin reembolso", no "Se reembolsará vía MercadoPago"', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    render(
      <QuickActions
        booking={booking({
          depositStatus: 'paid',
          depositAmount: 450_000,
          paymentMethod: 'mercadopago',
          endsAt: past,
        })}
        label="Juan · 14:00"
        {...quickActions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(screen.getAllByRole('radio')[0]!) // complejo

    expect(dialog).toHaveTextContent('El turno ya se jugó: la seña queda para el complejo (sin reembolso).')
    expect(dialog).not.toHaveTextContent('Se reembolsará vía MercadoPago')
  })

  it('booking.endsAt en el pasado + sin seña pagada: el check de !hasPaidDeposit gana, warning dice "no tiene seña pagada"', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    render(
      <QuickActions
        booking={booking({
          depositStatus: 'not_required',
          depositAmount: 0,
          paymentMethod: null,
          endsAt: past,
        })}
        label="Juan · 14:00"
        {...quickActions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(screen.getAllByRole('radio')[0]!) // complejo

    expect(dialog).toHaveTextContent('Esta reserva no tiene seña pagada. Solo se libera el turno.')
    expect(dialog).not.toHaveTextContent('El turno ya se jugó')
    expect(dialog).not.toHaveTextContent('Se reembolsará')
  })
})
