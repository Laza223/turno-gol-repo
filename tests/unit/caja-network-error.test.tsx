// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
// StreetMoneyChargeDialog importa las Server Actions directo (no por prop).
vi.mock('@/app/(admin)/caja/deudas/actions', () => ({ chargeDebtAction: vi.fn() }))
vi.mock('@/app/(admin)/caja/cantina/actions', () => ({ settleTabAction: vi.fn() }))
vi.mock('@/app/(admin)/torneos/actions', () => ({ registerInscriptionPaymentAction: vi.fn() }))

import { TicketPanel } from '@/app/(admin)/caja/cantina/TicketPanel'
import { FiadosList } from '@/app/(admin)/caja/cantina/FiadosList'
import { RegisterMovementModal } from '@/app/(admin)/caja/cantina/RegisterMovementModal'
import { StockEntryDialog } from '@/app/(admin)/caja/productos/StockEntryDialog'
import { StockExitDialog } from '@/app/(admin)/caja/productos/StockExitDialog'
import { StreetMoneyChargeDialog } from '@/app/(admin)/caja/deudas/StreetMoneyChargeDialog'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'
import { canteenProduct, canteenTab } from '@/test/fixtures'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'

/**
 * Barrido de la clase R3 (docs/audit/2026-09-16-revision-tanda-319-324.md) en
 * `/caja`: si la red corta una request que SÍ entró, la pantalla no puede
 * (1) mandar otra cosa con la misma key —el servidor la toma por reintento,
 * contesta éxito y lo nuevo no se registra— ni (2) armar key nueva al reabrir
 * el diálogo —el reintento se registra dos veces. Después de un corte, lo único
 * que se puede mandar es ESE envío, con la misma key.
 */

const NETWORK_ERROR = new TypeError('Failed to fetch')

type KeyedCall = { clientIdempotencyKey: string }

function calls(fn: { mock: { calls: unknown[][] } }): KeyedCall[] {
  return fn.mock.calls.map((c) => c[0] as KeyedCall)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('TicketPanel', () => {
  const product = canteenProduct()
  const productButton = () =>
    screen.getAllByRole('button', { name: new RegExp(`^${product.name}`) })[0]!

  it('después de un corte, el ticket queda trabado y sólo se reintenta ESA venta, con la misma key', async () => {
    const sellTicketAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true, total: 150000 })
    render(
      <TicketPanel
        products={[product]}
        sellTicketAction={sellTicketAction}
        createTabAction={vi.fn()}
      />,
    )

    fireEvent.click(productButton())
    fireEvent.click(screen.getAllByRole('button', { name: /^Cobrar/ })[0]!)

    const [retry] = await screen.findAllByRole('button', { name: /^Reintentar cobro de/ })
    // Nada que pueda cambiar el ticket o mandar otra cosa: esas líneas pueden
    // ya estar vendidas.
    expect(productButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vaciar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Anotar como fiado' })).toBeDisabled()
    expect(screen.getAllByText(/no sabemos si la venta de/)[0]).toBeInTheDocument()

    fireEvent.click(retry!)
    await waitFor(() => expect(sellTicketAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(sellTicketAction)
    expect(second).toEqual(first)

    // El servidor contestó: la venta siguiente ya no hereda la key.
    await waitFor(() => expect(productButton()).not.toBeDisabled())
    fireEvent.click(productButton())
    fireEvent.click(screen.getAllByRole('button', { name: /^Cobrar/ })[0]!)
    await waitFor(() => expect(sellTicketAction).toHaveBeenCalledTimes(3))
    expect(calls(sellTicketAction)[2]!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })

  it('un fiado cortado traba el ticket: no se puede cobrar y el reintento va con la misma key', async () => {
    const sellTicketAction = vi.fn()
    const createTabAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true, debtorName: 'Capitán', total: 150000 })
    render(
      <TicketPanel
        products={[product]}
        sellTicketAction={sellTicketAction}
        createTabAction={createTabAction}
      />,
    )

    fireEvent.click(productButton())
    fireEvent.click(screen.getByRole('button', { name: 'Anotar como fiado' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('¿A nombre de quién?'), {
      target: { value: 'Capitán' },
    })
    fireEvent.click(dialog.getByRole('button', { name: /^Anotar fiado/ }))
    await dialog.findByRole('button', { name: 'Reintentar fiado' })

    fireEvent.click(dialog.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Esas líneas pueden estar ya anotadas: cobrarlas sería registrarlas dos veces.
    for (const cobrar of screen.getAllByRole('button', { name: /^Cobrar/ })) {
      expect(cobrar).toBeDisabled()
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'Reintentar fiado' })[0]!)
    const reopened = within(await screen.findByRole('dialog'))
    fireEvent.click(reopened.getByRole('button', { name: 'Reintentar fiado' }))

    await waitFor(() => expect(createTabAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(createTabAction)
    expect(second).toEqual(first)
    expect(sellTicketAction).not.toHaveBeenCalled()
  })
})

describe('StockEntryDialog', () => {
  it('cerrar y reabrir no arma key nueva: el reintento manda la misma reposición', async () => {
    const product = canteenProduct()
    const registerPurchaseAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true })
    const props = { onClose: vi.fn(), onSaved: vi.fn(), registerPurchaseAction }
    const { rerender } = render(<StockEntryDialog product={product} {...props} />)

    fireEvent.change(screen.getByLabelText('Packs'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unidades por pack'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reposición' }))
    await screen.findByRole('button', { name: 'Reintentar reposición' })

    rerender(<StockEntryDialog product={null} {...props} />)
    rerender(<StockEntryDialog product={product} {...props} />)

    expect(screen.getByText(/no sabemos si la reposición de 24 ×/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar reposición' }))
    await waitFor(() => expect(registerPurchaseAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(registerPurchaseAction)
    expect(second).toEqual(first)
  })
})

describe('diálogo compartido por varias filas', () => {
  it('abierto para OTRO producto, muestra y reintenta el intento pendiente, no el nuevo', async () => {
    const agua = canteenProduct()
    const gaseosa = canteenProduct({ id: '22222222-2222-4222-8222-222222222222', name: 'Gaseosa' })
    const registerPurchaseAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true })
    const props = { onClose: vi.fn(), onSaved: vi.fn(), registerPurchaseAction }
    const { rerender } = render(<StockEntryDialog product={agua} {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar reposición' }))
    await screen.findByRole('button', { name: 'Reintentar reposición' })
    rerender(<StockEntryDialog product={null} {...props} />)
    rerender(<StockEntryDialog product={gaseosa} {...props} />)

    // Título y cuerpo nombran lo mismo: lo que quedó sin confirmar.
    expect(screen.getByRole('heading', { name: `Reponer — ${agua.name}` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar reposición' }))
    await waitFor(() => expect(registerPurchaseAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(registerPurchaseAction)
    expect(second).toEqual(first)
    expect(second).toMatchObject({ productId: agua.id })
  })
})

describe('StockExitDialog', () => {
  const product = canteenProduct()
  const props = () => ({ onClose: vi.fn(), onSaved: vi.fn() })

  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'latas vencidas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }))
  }

  it('cerrar y reabrir no arma key nueva: el reintento manda la misma salida', async () => {
    const registerStockExitAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true })
    const p = { ...props(), registerStockExitAction }
    const { rerender } = render(<StockExitDialog product={product} {...p} />)

    fillAndSubmit()
    await screen.findByRole('button', { name: 'Reintentar salida' })
    rerender(<StockExitDialog product={null} {...p} />)
    rerender(<StockExitDialog product={product} {...p} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar salida' }))
    await waitFor(() => expect(registerStockExitAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(registerStockExitAction)
    expect(second).toEqual(first)
  })

  it('un error del servidor no deja nada escrito: el próximo envío va con key nueva', async () => {
    const registerStockExitAction = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'No hay stock suficiente.' })
      .mockResolvedValue({ success: true })
    render(
      <StockExitDialog
        product={product}
        {...props()}
        registerStockExitAction={registerStockExitAction}
      />,
    )

    fillAndSubmit()
    await screen.findByText('No hay stock suficiente.')
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar salida' }))

    await waitFor(() => expect(registerStockExitAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(registerStockExitAction)
    expect(second!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })
})

describe('RegisterMovementModal', () => {
  it('cerrar (que reinicia el formulario) y reabrir no arma key nueva', async () => {
    const createCashFlowAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true, cashFlow: {} })
    const props = { onClose: vi.fn(), date: '2026-06-10', cutoffMins: 0, createCashFlowAction }
    const { rerender } = render(<RegisterMovementModal open {...props} />)

    fireEvent.change(screen.getByLabelText('Monto (pesos)'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Hielo' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)
    await screen.findByRole('button', { name: 'Reintentar movimiento' })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    rerender(<RegisterMovementModal open={false} {...props} />)
    rerender(<RegisterMovementModal open {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar movimiento' }))
    await waitFor(() => expect(createCashFlowAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(createCashFlowAction)
    expect(second).toEqual(first)
    expect(second).toMatchObject({ amount: 123400, description: 'Hielo' })
  })
})

describe('FiadosList — cobrar fiado', () => {
  it('cerrar y reabrir el fiado no arma key nueva: el reintento manda el mismo cobro', async () => {
    const tab = canteenTab()
    const settleTabAction = vi
      .fn()
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true, total: tab.totalAmount })
    render(<FiadosList tabs={[tab]} settleTabAction={settleTabAction} cancelTabAction={vi.fn()} />)

    const openRow = () =>
      fireEvent.click(screen.getAllByRole('button', { name: (n) => n.startsWith('Cobrar') })[0]!)
    openRow()
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /^Cobrar todo en efectivo/ }))
    await dialog.findByRole('button', { name: 'Reintentar cobro' })

    fireEvent.click(dialog.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    openRow()

    const reopened = within(await screen.findByRole('dialog'))
    fireEvent.click(reopened.getByRole('button', { name: 'Reintentar cobro' }))
    await waitFor(() => expect(settleTabAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(settleTabAction)
    expect(second).toEqual(first)
  })
})

describe('StreetMoneyChargeDialog', () => {
  it('cerrar y reabrir la deuda no arma key nueva: el reintento manda el mismo cobro', async () => {
    const row: StreetMoneyRow = {
      origin: 'booking',
      refId: '11111111-1111-4111-8111-111111111111',
      debtorName: 'Martina Sosa',
      pendingCents: 2_400_000,
      since: new Date('2026-06-10T21:00:00Z'),
      courtName: 'Cancha 1',
      date: '2026-06-10',
      timeStart: '18:00',
      timeEnd: '19:00',
      playerId: null,
      contactPhone: null,
    }
    vi.mocked(chargeDebtAction)
      .mockRejectedValueOnce(NETWORK_ERROR)
      .mockResolvedValue({ success: true } as never)
    const onClose = vi.fn()
    const { rerender } = render(<StreetMoneyChargeDialog row={row} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /^Cobrar todo en efectivo/ }))
    await screen.findByRole('button', { name: 'Reintentar cobro' })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
    rerender(<StreetMoneyChargeDialog row={null} onClose={onClose} />)
    rerender(<StreetMoneyChargeDialog row={row} onClose={onClose} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar cobro' }))
    await waitFor(() => expect(chargeDebtAction).toHaveBeenCalledTimes(2))
    const [first, second] = calls(vi.mocked(chargeDebtAction))
    expect(second).toEqual(first)
  })
})
