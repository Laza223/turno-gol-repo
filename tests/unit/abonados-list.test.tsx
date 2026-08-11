// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

import { AbonadosList } from '@/app/(admin)/abonados/AbonadosList'
import type { AbonadoRow } from '@/modules/abonados/abonado.types'

function makeAbonado(overrides: Partial<AbonadoRow>): AbonadoRow {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    tenantId: 'tttttttt-0000-0000-0000-000000000001',
    courtId: 'cccccccc-0000-0000-0000-000000000001',
    playerId: null,
    contactName: 'Grupo Test',
    contactPhone: '1199887766',
    dayOfWeek: 1, // Lun
    timeStart: '10:00',
    timeEnd: '11:00',
    pricePerSession: 500000, // ARS 5000 in centavos
    startsOn: new Date('2026-01-01'),
    endsOn: null,
    status: 'active',
    paymentMethod: 'cash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

const ACTIVE_ABONADO = makeAbonado({ id: 'aaaaaaaa-0000-0000-0000-000000000001', status: 'active' })
const PAUSED_ABONADO = makeAbonado({
  id: 'aaaaaaaa-0000-0000-0000-000000000002',
  status: 'paused',
  contactName: 'Grupo Pausado',
})
const CANCELED_ABONADO = makeAbonado({
  id: 'aaaaaaaa-0000-0000-0000-000000000003',
  status: 'canceled',
  contactName: 'Grupo Cancelado',
})

// Las 4 Server Actions ya no se importan del módulo — AbonadosList las recibe
// por prop (ver el comentario en AbonadosList.tsx). Acá van como mocks locales.
const pauseAbonadoAction = vi.fn()
const reactivateAbonadoAction = vi.fn()
const cancelAbonadoAction = vi.fn()
const previewAbonadoSlotsAction = vi.fn()

function renderList(abonados: AbonadoRow[], filterLabel?: string) {
  return render(
    <AbonadosList
      abonados={abonados}
      filterLabel={filterLabel}
      pauseAction={pauseAbonadoAction}
      reactivateAction={reactivateAbonadoAction}
      cancelAction={cancelAbonadoAction}
      previewSlotsAction={previewAbonadoSlotsAction}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

// La lista renderiza cada abonado DOS veces (tabla desktop + card mobile,
// patrón caja): los queries de elementos por-abonado usan getAllBy* y [0]
// (la tabla va primero en el DOM). Los queries dentro del dialog siguen
// singulares: Radix marca aria-hidden el resto del body mientras está abierto.
describe('AbonadosList — rendering', () => {
  it('renders all 3 abonados with correct status badges', () => {
    renderList([ACTIVE_ABONADO, PAUSED_ABONADO, CANCELED_ABONADO])
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pausado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
  })

  it('active row shows Pausar + Cancelar buttons', () => {
    renderList([ACTIVE_ABONADO])
    expect(screen.getAllByRole('button', { name: 'Pausar' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBeGreaterThan(0)
  })

  it('paused row shows Reactivar + Cancelar buttons', () => {
    renderList([PAUSED_ABONADO])
    expect(screen.getAllByRole('button', { name: 'Reactivar' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBeGreaterThan(0)
  })

  it('canceled row shows no action buttons', () => {
    renderList([CANCELED_ABONADO])
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull()
  })

  it('renders EmptyState when no abonados', () => {
    renderList([])
    expect(screen.getByText('Sin turnos fijos registrados')).toBeTruthy()
  })
})

describe('AbonadosList — Cancel action', () => {
  it('clicking Cancelar opens the ConfirmDialog with phrase input', async () => {
    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)

    // timeout explícito: este es el PRIMER test del archivo que dispara el
    // next/dynamic de AbonadoDialogs, así que paga el cold-start del chunk. Bajo
    // Next 16 esa primera resolución se pasa del waitFor default de 1s de RTL
    // (~1.5s medido); los tests siguientes reusan el módulo cacheado y tardan
    // ~70ms. No se relaja el contrato: si el diálogo no abre, igual falla.
    await waitFor(
      () => {
        // Dialog title is in a heading element
        expect(screen.getByRole('heading', { name: 'Cancelar turno fijo' })).toBeTruthy()
      },
      { timeout: 5000 },
    )

    // Phrase input should be present
    expect(screen.getByLabelText(/Escribí/i)).toBeTruthy()
  })

  it('type-to-confirm gates the destructive confirm button', async () => {
    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cancelar turno fijo' })).toBeTruthy()
    })

    // Find the confirm button inside the dialog (not the row button)
    const confirmBtn = screen.getByRole('button', { name: 'Cancelar turno fijo' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    // Type the phrase
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })
  })

  it('server error keeps dialog open and shows error message', async () => {
    cancelAbonadoAction.mockResolvedValue({
      success: false,
      error: 'Abonado ya cancelado.',
    })

    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancelar turno fijo' })).toBeTruthy())

    // Type phrase to enable confirm
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    const confirmBtn = screen.getByRole('button', { name: 'Cancelar turno fijo' }) as HTMLButtonElement

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Abonado ya cancelado.')
    })

    // Dialog stays open — heading still visible
    expect(screen.getByRole('heading', { name: 'Cancelar turno fijo' })).toBeTruthy()
  })

  it('successful cancel calls cancelAbonadoAction with id and fromDate', async () => {
    cancelAbonadoAction.mockResolvedValue({
      success: true,
      abonado: { ...ACTIVE_ABONADO, status: 'canceled' },
    })

    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancelar turno fijo' })).toBeTruthy())

    // Type phrase
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    const confirmBtn = screen.getByRole('button', { name: 'Cancelar turno fijo' }) as HTMLButtonElement

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(cancelAbonadoAction).toHaveBeenCalledWith(
        ACTIVE_ABONADO.id,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      )
    })
  })
})

describe('AbonadosList — Pause action', () => {
  it('clicking Pausar opens ConfirmDialog without type-to-confirm', async () => {
    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!)

    await waitFor(() => {
      expect(screen.getByText('Pausar turno fijo')).toBeTruthy()
    })

    // No phrase input for pause
    expect(screen.queryByLabelText(/Escribí/i)).toBeNull()
  })

  it('successful pause calls pauseAbonadoAction', async () => {
    pauseAbonadoAction.mockResolvedValue({
      success: true,
      abonado: { ...ACTIVE_ABONADO, status: 'paused' },
    })

    renderList([ACTIVE_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!)
    await waitFor(() => expect(screen.getByText('Pausar turno fijo')).toBeTruthy())

    // Dialog abierto: Radix deja el resto aria-hidden → un solo "Pausar" accesible.
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))

    await waitFor(() => {
      expect(pauseAbonadoAction).toHaveBeenCalledWith(ACTIVE_ABONADO.id)
    })
  })
})

describe('AbonadosList — Reactivate action', () => {
  it('clicking Reactivar loads preview and shows slot count', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08', '2026-06-15'],
      conflicts: [],
    })

    renderList([PAUSED_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(screen.getByText('Reactivar turno fijo')).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Se generarán/)).toBeTruthy()
    })
  })

  it('calls reactivateAbonadoAction on confirm', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01'],
      conflicts: [],
    })
    reactivateAbonadoAction.mockResolvedValue({
      success: true,
      abonado: { ...PAUSED_ABONADO, status: 'active' },
      slotsGenerated: 1,
    })

    renderList([PAUSED_ABONADO])

    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)
    await waitFor(() => expect(screen.getByText('Reactivar turno fijo')).toBeTruthy())

    await waitFor(() => {
      expect(screen.getByText(/Se generarán/)).toBeTruthy()
    })

    // Dialog abierto: único "Reactivar" accesible es el confirm del dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => {
      expect(reactivateAbonadoAction).toHaveBeenCalledWith(PAUSED_ABONADO.id)
    })
  })

  it('pasa el endsOn del abonado (YYYY-MM-DD) al preview (#15)', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08'],
      conflicts: [],
    })

    const withEnd = makeAbonado({
      id: 'aaaaaaaa-0000-0000-0000-000000000099',
      status: 'paused',
      // medianoche UTC, igual a como lo persiste createAbonado
      endsOn: new Date('2026-06-30T00:00:00Z'),
    })

    renderList([withEnd])
    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(previewAbonadoSlotsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          courtId: withEnd.courtId,
          startsOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          endsOn: '2026-06-30',
        }),
      )
    })
  })

  it('pasa endsOn: undefined cuando el abonado no tiene fecha de fin (#15)', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01'],
      conflicts: [],
    })

    // PAUSED_ABONADO tiene endsOn: null (default de makeAbonado)
    renderList([PAUSED_ABONADO])
    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(previewAbonadoSlotsAction).toHaveBeenCalledTimes(1)
    })
    const [arg] = previewAbonadoSlotsAction.mock.calls[0]!
    expect(arg.endsOn).toBeUndefined()
  })
})
