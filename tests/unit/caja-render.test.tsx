// @vitest-environment happy-dom
/**
 * Contratos de render del rediseño de Caja (pages/caja.md):
 *  - Modal de movimiento con chips (§7): cambiar tipo re-selecciona la primera
 *    categoría válida (VALID_COMBOS) y el payload de la action sale coherente.
 *  - CierreCard (§5): las tres variantes del peak-end (cuadró / sin arqueo /
 *    con diferencia anotada).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

// createCashFlowAction ya no se importa del módulo — RegisterMovementModal la
// recibe por prop (ver el comentario en RegisterMovementModal.tsx).
const createCashFlowAction = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { RegisterMovementModal } from '@/app/(admin)/caja/components/RegisterMovementModal'
import { CierreCard } from '@/app/(admin)/caja/components/CierreCard'
import type { DailyCashCloseRow } from '@/modules/cashflow/cashflow.types'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('RegisterMovementModal — chips', () => {
  it('elegir "Gasto" auto-selecciona su única categoría y el payload sale válido', async () => {
    createCashFlowAction.mockResolvedValueOnce({ success: true, cashFlow: {} })
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        createCashFlowAction={createCashFlowAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gasto' }))
    expect(pressed('Gasto operativo')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Monto (pesos)'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Hielo' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)

    await waitFor(() => expect(createCashFlowAction).toHaveBeenCalledOnce())
    expect(createCashFlowAction.mock.calls[0]![0]).toMatchObject({
      type: 'expense',
      category: 'operating_expense',
      method: 'transfer',
      amount: 123400,
      description: 'Hielo',
    })
  })

  it('volver a "Ingreso" re-selecciona "Reserva" (nunca queda una categoría de otro tipo)', () => {
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        createCashFlowAction={createCashFlowAction}
      />,
    )

    expect(pressed('Reserva')).toBe('true') // default
    fireEvent.click(screen.getByRole('button', { name: 'Ajuste' }))
    expect(pressed('Corrección por ausencia')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ingreso' }))
    expect(pressed('Reserva')).toBe('true')
  })
})

function makeClose(overrides: Partial<DailyCashCloseRow> = {}): DailyCashCloseRow {
  return {
    id: 'close-1',
    tenantId: 'tenant-1',
    date: new Date('2026-06-10T00:00:00Z'),
    totalIncome: 5000000,
    totalAdjustments: 0,
    totalExpense: 1000000,
    balance: 4000000,
    declaredCash: 4000000,
    diffAmount: 0,
    openingCash: null,
    expectedCash: null,
    note: null,
    closedBy: 'staff-1',
    closedAt: new Date('2026-06-11T02:40:00Z'), // 23:40 ART
    ...overrides,
  }
}

describe('CierreCard — variantes del peak-end', () => {
  it('arqueo que cuadra: título verde "el efectivo cuadró" + totales contables', () => {
    render(<CierreCard close={makeClose()} />)
    expect(screen.getByText('Caja cerrada — el efectivo cuadró')).toBeTruthy()
    expect(screen.getByText(/23:40/)).toBeTruthy()
    expect(screen.getByText('Efectivo contado')).toBeTruthy()
    // Formato contable §8.2 (con decimales).
    expect(screen.getByText(/50\.000,00/)).toBeTruthy() // ingresos
    expect(screen.queryByText(/Diferencia/)).toBeNull()
  })

  it('sin arqueo declarado (declared=0, diff=balance): oculta Efectivo/Diferencia', () => {
    render(<CierreCard close={makeClose({ declaredCash: 0, diffAmount: 4000000 })} />)
    expect(screen.getByText('Caja cerrada')).toBeTruthy()
    expect(screen.queryByText('Efectivo contado')).toBeNull()
    expect(screen.queryByText(/Diferencia/)).toBeNull()
  })

  it('con diferencia: título honesto + monto amber + nota visible', () => {
    render(
      <CierreCard
        close={makeClose({ declaredCash: 3900000, diffAmount: 100000, note: 'Faltó un vuelto' })}
      />,
    )
    expect(screen.getByText('Caja cerrada — con diferencia anotada')).toBeTruthy()
    expect(screen.getByText(/Diferencia de/)).toBeTruthy()
    expect(screen.getByText(/1\.000,00/)).toBeTruthy()
    expect(screen.getByText(/Faltó un vuelto/)).toBeTruthy()
  })

  // ── v2 (migr. 049): expectedCash/openingCash no-null ──────────────────────
  it('v2 — arqueo que cuadra: agrega Fondo inicial/Efectivo esperado al <dl>', () => {
    render(
      <CierreCard
        close={makeClose({
          openingCash: 300000,
          expectedCash: 4300000,
          declaredCash: 4300000,
          diffAmount: 0,
        })}
      />,
    )
    expect(screen.getByText('Caja cerrada — el efectivo cuadró')).toBeTruthy()
    expect(screen.getByText('Fondo inicial')).toBeTruthy()
    // "43.000,00" (Efectivo esperado/contado) contiene "3.000,00" como substring
    // — DOM-traversal en vez de regex para no pescar la fila equivocada.
    const fondoDd = screen.getByText('Fondo inicial').closest('div')!.querySelector('dd')!
    expect(fondoDd.textContent).toContain('3.000,00')
    expect(screen.getByText('Efectivo esperado')).toBeTruthy()
    expect(screen.getByText('Efectivo contado')).toBeTruthy()
    expect(screen.getByText('Diferencia')).toBeTruthy()
    // Sin el párrafo ámbar legacy — la diferencia vive en el <dl> ahora.
    expect(screen.queryByText(/respecto del saldo/)).toBeNull()
  })

  it('v2 — sin arqueo declarado (declaredCash=0): oculta Efectivo contado/Diferencia', () => {
    render(
      <CierreCard
        close={makeClose({
          openingCash: 300000,
          expectedCash: 4300000,
          declaredCash: 0,
          diffAmount: -4300000,
        })}
      />,
    )
    expect(screen.getByText('Caja cerrada — sin arqueo declarado')).toBeTruthy()
    expect(screen.getByText('Fondo inicial')).toBeTruthy()
    expect(screen.getByText('Efectivo esperado')).toBeTruthy()
    expect(screen.queryByText('Efectivo contado')).toBeNull()
    expect(screen.queryByText('Diferencia')).toBeNull()
  })

  it('v2 — sobraron plata: título "sobraron $X" y Diferencia con signo +', () => {
    render(
      <CierreCard
        close={makeClose({
          openingCash: 300000,
          expectedCash: 4300000,
          declaredCash: 4400000,
          diffAmount: 100000,
        })}
      />,
    )
    expect(screen.getByText(/Caja cerrada — sobraron/)).toBeTruthy()
    // DOM-traversal en vez de regex sobre "$"/espacio (NBSP del Intl formatter).
    const dd = screen.getByText('Diferencia').closest('div')!.querySelector('dd')!
    expect(dd.textContent).toContain('+')
    expect(dd.textContent).toContain('1.000,00')
  })

  it('v2 — faltaron plata: título "faltaron $X" y Diferencia con signo −', () => {
    render(
      <CierreCard
        close={makeClose({
          openingCash: 300000,
          expectedCash: 4300000,
          declaredCash: 4200000,
          diffAmount: -100000,
        })}
      />,
    )
    expect(screen.getByText(/Caja cerrada — faltaron/)).toBeTruthy()
    const dd = screen.getByText('Diferencia').closest('div')!.querySelector('dd')!
    expect(dd.textContent).toContain('−')
    expect(dd.textContent).toContain('1.000,00')
  })
})
