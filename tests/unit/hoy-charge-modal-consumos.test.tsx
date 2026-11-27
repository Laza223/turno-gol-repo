// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { RenderCanteenDialog, SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * Consumos anotados al turno (docs/decisions/2026-11-17-consumos-anotados-al-turno.md):
 * lo que pidieron durante el partido queda anotado y el cobro de "Todo junto" lo suma.
 *
 * Primero se saldan los anotados (`settleTab`) y después corre la acción de cobro del
 * turno de siempre. Cada pata es idempotente y verdadera por sí sola: si la segunda
 * falla, el consumo quedó cobrado y el turno sigue por cobrar.
 */

const PRICE = 2_400_000 // $24.000 de cancha
const CONSUMO = 600_000 // 2 birras = $6.000

const CONSUMOS = [{ tabId: 'tab-1', totalAmount: CONSUMO, items: [{ name: 'Birra', qty: 2 }] }]

function makeActions(overrides: Partial<SlotPanelActions> = {}): SlotPanelActions {
  return {
    chargeDebtAction: vi.fn(async () => ({ success: true as const })),
    completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
    addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
    markNoShowAction: vi.fn(async () => ({ success: true as const })),
    listBookingConsumosAction: vi.fn(async () => ({
      success: true as const,
      consumos: CONSUMOS,
    })),
    settleTabAction: vi.fn(async () => ({ success: true as const, total: CONSUMO })),
    cancelTabAction: vi.fn(async () => ({ success: true as const })),
    ...overrides,
  }
}

function renderModal(
  actions: SlotPanelActions,
  opts: {
    booking?: Partial<ReturnType<typeof toGridBooking>>
    renderCanteenDialog?: RenderCanteenDialog
  } = {},
) {
  const b = {
    ...toGridBooking(booking(), player()),
    priceSnapshot: PRICE,
    totalPaid: 0,
    pending: PRICE,
    ...opts.booking,
  }
  render(
    <HoyChargeModal
      booking={b}
      courtName="Cancha 1"
      courts={[
        {
          id: b.courtId,
          name: 'Cancha 1',
          status: 'online',
          capacity: 10,
          pricing: { rules: [] } as never,
        },
      ]}
      dayBookings={[]}
      daySlots={[]}
      nowMs={Date.now()}
      isRefreshing={false}
      onClose={vi.fn()}
      onMutated={vi.fn()}
      hasEnded={false}
      actions={actions}
      renderCanteenDialog={opts.renderCanteenDialog}
    />,
  )
}

type SettleCall = {
  tabId: string
  charges: { amount: number; method: string }[]
  clientIdempotencyKey: string
}
type ChargeCall = { charges: { amount: number; method: string }[]; clientIdempotencyKey?: string }

afterEach(cleanup)

describe('modal de cobro: consumos anotados al turno', () => {
  it('sin anotados el modal queda como siempre: no hay bloque y cobra solo la cancha', async () => {
    const settleTabAction = vi.fn(async () => ({ success: true as const, total: 0 }))
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(
      makeActions({
        listBookingConsumosAction: vi.fn(async () => ({ success: true as const, consumos: [] })),
        settleTabAction,
        addBookingChargeAction,
      }),
    )

    const cobrar = await screen.findByRole('button', { name: /^Cobrar .*24\.000/ })
    // El botón espera la primera lectura de los anotados: recién después se puede cobrar.
    await waitFor(() => expect(cobrar).toBeEnabled())
    expect(screen.queryByRole('group', { name: 'Consumos anotados' })).toBeNull()

    fireEvent.click(cobrar)
    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(1))
    expect(settleTabAction).not.toHaveBeenCalled()
  })

  it('avisa lo anotado, suma el consumo al botón y cobra primero lo anotado y después el turno', async () => {
    const settleTabAction = vi.fn<NonNullable<SlotPanelActions['settleTabAction']>>(async () => ({
      success: true as const,
      total: CONSUMO,
    }))
    const addBookingChargeAction = vi.fn<SlotPanelActions['addBookingChargeAction']>(async () => ({
      success: true as const,
    }))
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    const grupo = await screen.findByRole('group', { name: 'Consumos anotados' })
    expect(grupo).toHaveTextContent('2 × Birra')
    // $24.000 de cancha + $6.000 de consumos, en un solo botón.
    const cobrar = screen.getByRole('button', { name: /^Cobrar .*30\.000/ })

    fireEvent.click(cobrar)

    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(1))
    expect(settleTabAction).toHaveBeenCalledTimes(1)
    const settle = settleTabAction.mock.calls[0]![0] as SettleCall
    expect(settle.tabId).toBe('tab-1')
    expect(settle.charges).toEqual([{ amount: CONSUMO, method: 'cash' }])
    // La cancha se cobra por su acción de siempre, solo con su monto.
    const charge = addBookingChargeAction.mock.calls[0]![0] as ChargeCall
    expect(charge.charges).toEqual([{ amount: PRICE, method: 'cash' }])
    // Primero lo anotado, después el turno.
    expect(settleTabAction.mock.invocationCallOrder[0]!).toBeLessThan(
      addBookingChargeAction.mock.invocationCallOrder[0]!,
    )
  })

  it('destildar "Cobrar con el turno" cobra solo la cancha y deja lo anotado para después', async () => {
    const settleTabAction = vi.fn(async () => ({ success: true as const, total: CONSUMO }))
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cobrar con el turno' }))
    const cobrar = await screen.findByRole('button', { name: /^Cobrar .*24\.000/ })
    expect(screen.queryByRole('button', { name: /30\.000/ })).toBeNull()

    fireEvent.click(cobrar)
    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(1))
    expect(settleTabAction).not.toHaveBeenCalled()
  })

  it('si lo anotado no se puede cobrar, el turno no se toca y se ve el motivo', async () => {
    const settleTabAction = vi.fn(async () => ({
      success: false as const,
      error: 'Ese fiado ya fue cobrado o anulado.',
    }))
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ }))

    await screen.findByText('Ese fiado ya fue cobrado o anulado.')
    expect(addBookingChargeAction).not.toHaveBeenCalled()
  })

  it('si falla el turno después de cobrar lo anotado, lo dice: el consumo ya quedó cobrado', async () => {
    const addBookingChargeAction = vi.fn(async () => ({
      success: false as const,
      error: 'Este turno ya está pagado por completo.',
    }))
    renderModal(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Lo anotado ya quedó cobrado')
    expect(alerta).toHaveTextContent('Este turno ya está pagado por completo.')
  })

  it('un corte de red en el turno reintenta TODO con las mismas keys: lo anotado no se cobra dos veces', async () => {
    const settleTabAction = vi.fn<NonNullable<SlotPanelActions['settleTabAction']>>(async () => ({
      success: true as const,
      total: CONSUMO,
    }))
    const addBookingChargeAction = vi
      .fn<SlotPanelActions['addBookingChargeAction']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true } as never)
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ }))
    // El reintento muestra el total de TODO lo que salió (cancha + consumos).
    const retry = await screen.findByRole('button', { name: /^Reintentar cobro de .*30\.000/ })

    fireEvent.click(retry)

    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(2))
    expect(settleTabAction).toHaveBeenCalledTimes(2)
    const [s1, s2] = settleTabAction.mock.calls.map((c) => c[0] as SettleCall)
    expect(s2!.clientIdempotencyKey).toBe(s1!.clientIdempotencyKey)
    const [c1, c2] = addBookingChargeAction.mock.calls.map((c) => c[0] as ChargeCall)
    expect(c2!.clientIdempotencyKey).toBe(c1!.clientIdempotencyKey)
  })

  it('mientras no llegan los anotados el botón espera: no cobra solo la cancha', async () => {
    let llegan!: (r: { success: true; consumos: typeof CONSUMOS }) => void
    const listBookingConsumosAction = vi
      .fn<NonNullable<SlotPanelActions['listBookingConsumosAction']>>()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            llegan = resolve
          }),
      )
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(makeActions({ listBookingConsumosAction, addBookingChargeAction }))

    const cobrar = await screen.findByRole('button', { name: /^Cobrar .*24\.000/ })
    expect(cobrar).toBeDisabled()
    fireEvent.click(cobrar)
    expect(addBookingChargeAction).not.toHaveBeenCalled()

    llegan({ success: true, consumos: CONSUMOS })
    await screen.findByRole('group', { name: 'Consumos anotados' })
    expect(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ })).toBeEnabled()
  })

  it('si no se pueden leer los anotados lo avisa y deja reintentar, en vez de cobrar callado', async () => {
    const listBookingConsumosAction = vi
      .fn<NonNullable<SlotPanelActions['listBookingConsumosAction']>>()
      .mockResolvedValueOnce({ success: false, error: 'Demasiados pedidos.' })
      .mockResolvedValue({ success: true, consumos: CONSUMOS })
    renderModal(makeActions({ listBookingConsumosAction }))

    await screen.findByText('No pudimos ver si hay consumos anotados.')
    expect(screen.queryByRole('group', { name: 'Consumos anotados' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await screen.findByRole('group', { name: 'Consumos anotados' })
    expect(screen.queryByText('No pudimos ver si hay consumos anotados.')).toBeNull()
    expect(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ })).toBeEnabled()
  })

  it('un corte de red al cobrar lo anotado reintenta con la misma key y el turno recién después', async () => {
    const settleTabAction = vi
      .fn<NonNullable<SlotPanelActions['settleTabAction']>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true, total: CONSUMO } as never)
    const addBookingChargeAction = vi.fn<SlotPanelActions['addBookingChargeAction']>(async () => ({
      success: true as const,
    }))
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ }))
    const retry = await screen.findByRole('button', { name: /^Reintentar cobro de .*30\.000/ })
    // El turno todavía no se tocó: la primera pata no contestó.
    expect(addBookingChargeAction).not.toHaveBeenCalled()

    fireEvent.click(retry)

    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(1))
    expect(settleTabAction).toHaveBeenCalledTimes(2)
    const [s1, s2] = settleTabAction.mock.calls.map((c) => c[0] as SettleCall)
    expect(s2!.clientIdempotencyKey).toBe(s1!.clientIdempotencyKey)
  })

  it('si el segundo anotado falla, dice cuánto ya se cobró y no toca el turno', async () => {
    const dos = [
      ...CONSUMOS,
      { tabId: 'tab-2', totalAmount: 300_000, items: [{ name: 'Agua', qty: 1 }] },
    ]
    const settleTabAction = vi
      .fn<NonNullable<SlotPanelActions['settleTabAction']>>()
      .mockResolvedValueOnce({ success: true, total: CONSUMO })
      .mockResolvedValueOnce({ success: false, error: 'Ese fiado ya fue cobrado o anulado.' })
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(
      makeActions({
        listBookingConsumosAction: vi.fn(async () => ({
          success: true as const,
          consumos: dos,
        })),
        settleTabAction,
        addBookingChargeAction,
      }),
    )

    // $24.000 + $6.000 + $3.000
    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*33\.000/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/Ya se cobró parte de lo anotado \(\$\s6\.000\)/)
    expect(alerta).toHaveTextContent('Ese fiado ya fue cobrado o anulado.')
    expect(settleTabAction).toHaveBeenCalledTimes(2)
    expect(addBookingChargeAction).not.toHaveBeenCalled()
  })

  it('con el pago dividido los anotados no viajan: la casilla se apaga y se avisa por qué', async () => {
    const settleTabAction = vi.fn(async () => ({ success: true as const, total: CONSUMO }))
    renderModal(makeActions({ settleTabAction }))

    // Con los anotados tildados el cobro es de un solo medio: para dividir hay que destildar.
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cobrar con el turno' }))
    fireEvent.click(await screen.findByRole('button', { name: /Agregar otro medio de pago/ }))

    const casilla = await screen.findByRole('checkbox', { name: 'Cobrar con el turno' })
    expect(casilla).toBeDisabled()
    expect(casilla).not.toBeChecked()
    expect(
      screen.getByText('Para sumarlos al cobro, dejá un solo medio de pago.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /30\.000/ })).toBeNull()
    expect(settleTabAction).not.toHaveBeenCalled()
  })

  it('con "Otro" y los anotados tildados no cobra nada y explica por qué', async () => {
    const settleTabAction = vi.fn(async () => ({ success: true as const, total: CONSUMO }))
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    renderModal(makeActions({ settleTabAction, addBookingChargeAction }))

    const metodo = await screen.findByRole('button', { name: /^Medio de pago/ })
    fireEvent.pointerDown(metodo, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Otro' }))

    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .*30\.000/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Los consumos no se cobran con "Otro"')
    expect(settleTabAction).not.toHaveBeenCalled()
    expect(addBookingChargeAction).not.toHaveBeenCalled()
  })

  it('"Anotar al turno" se ofrece solo si el modal puede cobrar lo anotado (queda saldo)', async () => {
    const abrir = async (b: Parameters<typeof renderModal>[1]) => {
      const renderCanteenDialog = vi.fn<RenderCanteenDialog>(({ open }) =>
        open ? <p>[diálogo de cantina]</p> : null,
      )
      renderModal(makeActions(), { ...b, renderCanteenDialog })
      fireEvent.click(await screen.findByRole('button', { name: /Sumar cantina/ }))
      await screen.findByText('[diálogo de cantina]')
      return renderCanteenDialog.mock.calls.at(-1)![0]
    }

    // Con saldo por cobrar: el cobro de este modal suma lo anotado.
    expect((await abrir({})).canNoteConsumo).toBe(true)
    cleanup()

    // Turno ya saldado: no hay dónde cobrarlo, así que no se ofrece anotar.
    expect(
      (await abrir({ booking: { status: 'completed', totalPaid: PRICE, pending: 0 } }))
        .canNoteConsumo,
    ).toBe(false)
  })

  it('quitar un anotado lo anula con un motivo fijo y vuelve a leer lo que queda', async () => {
    const cancelTabAction = vi.fn(async () => ({ success: true as const }))
    const listBookingConsumosAction = vi
      .fn<NonNullable<SlotPanelActions['listBookingConsumosAction']>>()
      .mockResolvedValueOnce({ success: true, consumos: CONSUMOS })
      .mockResolvedValue({ success: true, consumos: [] })
    renderModal(makeActions({ cancelTabAction, listBookingConsumosAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Quitar del turno: 2 × Birra/ }))

    await waitFor(() => expect(cancelTabAction).toHaveBeenCalledTimes(1))
    expect(cancelTabAction).toHaveBeenCalledWith({
      tabId: 'tab-1',
      reason: 'Se quitó del turno al cobrar',
    })
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Consumos anotados' })).toBeNull(),
    )
  })

  it('en "Por jugador" los consumos no viajan: se avisa que se cobran en "Todo junto"', async () => {
    const settleTabAction = vi.fn(async () => ({ success: true as const, total: CONSUMO }))
    renderModal(makeActions({ settleTabAction }))

    await screen.findByRole('group', { name: 'Consumos anotados' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Por jugador' }))

    expect(await screen.findByText(/consumos anotados: se cobran en/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Consumos anotados' })).toBeNull()
    expect(settleTabAction).not.toHaveBeenCalled()
  })
})
