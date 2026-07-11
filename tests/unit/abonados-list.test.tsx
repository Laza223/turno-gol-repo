// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// Mock server actions before importing AbonadosList
vi.mock('@/app/(admin)/abonados/actions', () => ({
  pauseAbonadoAction: vi.fn(),
  reactivateAbonadoAction: vi.fn(),
  cancelAbonadoAction: vi.fn(),
}))

vi.mock('@/app/(admin)/abonados/nuevo/actions', () => ({
  previewAbonadoSlotsAction: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

import { AbonadosList } from '@/app/(admin)/abonados/AbonadosList'
import {
  pauseAbonadoAction,
  reactivateAbonadoAction,
  cancelAbonadoAction,
} from '@/app/(admin)/abonados/actions'
import { previewAbonadoSlotsAction } from '@/app/(admin)/abonados/nuevo/actions'
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
    notes: null,
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
    render(
      <AbonadosList abonados={[ACTIVE_ABONADO, PAUSED_ABONADO, CANCELED_ABONADO]} />,
    )
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pausado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
  })

  it('active row shows Pausar + Cancelar buttons', () => {
    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)
    expect(screen.getAllByRole('button', { name: 'Pausar' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBeGreaterThan(0)
  })

  it('paused row shows Reactivar + Cancelar buttons', () => {
    render(<AbonadosList abonados={[PAUSED_ABONADO]} />)
    expect(screen.getAllByRole('button', { name: 'Reactivar' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBeGreaterThan(0)
  })

  it('canceled row shows no action buttons', () => {
    render(<AbonadosList abonados={[CANCELED_ABONADO]} />)
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull()
  })

  it('renders EmptyState when no abonados', () => {
    render(<AbonadosList abonados={[]} />)
    expect(screen.getByText('Sin abonados registrados')).toBeTruthy()
  })
})

describe('AbonadosList — Cancel action', () => {
  it('clicking Cancelar opens the ConfirmDialog with phrase input', async () => {
    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)

    await waitFor(() => {
      // Dialog title is in a heading element
      expect(screen.getByRole('heading', { name: 'Cancelar abonado' })).toBeTruthy()
    })

    // Phrase input should be present
    expect(screen.getByLabelText(/Escribí/i)).toBeTruthy()
  })

  it('type-to-confirm gates the destructive confirm button', async () => {
    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cancelar abonado' })).toBeTruthy()
    })

    // Find the confirm button inside the dialog (not the row button)
    const confirmBtn = screen.getByRole('button', { name: 'Cancelar abonado' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    // Type the phrase
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })
  })

  it('server error keeps dialog open and shows error message', async () => {
    vi.mocked(cancelAbonadoAction).mockResolvedValue({
      success: false,
      error: 'Abonado ya cancelado.',
    })

    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancelar abonado' })).toBeTruthy())

    // Type phrase to enable confirm
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    const confirmBtn = screen.getByRole('button', { name: 'Cancelar abonado' }) as HTMLButtonElement

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Abonado ya cancelado.')
    })

    // Dialog stays open — heading still visible
    expect(screen.getByRole('heading', { name: 'Cancelar abonado' })).toBeTruthy()
  })

  it('successful cancel calls cancelAbonadoAction with id and fromDate', async () => {
    vi.mocked(cancelAbonadoAction).mockResolvedValue({
      success: true,
      abonado: { ...ACTIVE_ABONADO, status: 'canceled' },
    })

    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancelar abonado' })).toBeTruthy())

    // Type phrase
    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CANCELAR' } })

    const confirmBtn = screen.getByRole('button', { name: 'Cancelar abonado' }) as HTMLButtonElement

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(vi.mocked(cancelAbonadoAction)).toHaveBeenCalledWith(
        ACTIVE_ABONADO.id,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      )
    })
  })
})

describe('AbonadosList — Pause action', () => {
  it('clicking Pausar opens ConfirmDialog without type-to-confirm', async () => {
    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!)

    await waitFor(() => {
      expect(screen.getByText('Pausar abonado')).toBeTruthy()
    })

    // No phrase input for pause
    expect(screen.queryByLabelText(/Escribí/i)).toBeNull()
  })

  it('successful pause calls pauseAbonadoAction', async () => {
    vi.mocked(pauseAbonadoAction).mockResolvedValue({
      success: true,
      abonado: { ...ACTIVE_ABONADO, status: 'paused' },
    })

    render(<AbonadosList abonados={[ACTIVE_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!)
    await waitFor(() => expect(screen.getByText('Pausar abonado')).toBeTruthy())

    // Dialog abierto: Radix deja el resto aria-hidden → un solo "Pausar" accesible.
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))

    await waitFor(() => {
      expect(vi.mocked(pauseAbonadoAction)).toHaveBeenCalledWith(ACTIVE_ABONADO.id)
    })
  })
})

describe('AbonadosList — Reactivate action', () => {
  it('clicking Reactivar loads preview and shows slot count', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08', '2026-06-15'],
      conflicts: [],
    })

    render(<AbonadosList abonados={[PAUSED_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(screen.getByText('Reactivar abonado')).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Se generarán/)).toBeTruthy()
    })
  })

  it('calls reactivateAbonadoAction on confirm', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: ['2026-06-01'],
      conflicts: [],
    })
    vi.mocked(reactivateAbonadoAction).mockResolvedValue({
      success: true,
      abonado: { ...PAUSED_ABONADO, status: 'active' },
      slotsGenerated: 1,
    })

    render(<AbonadosList abonados={[PAUSED_ABONADO]} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)
    await waitFor(() => expect(screen.getByText('Reactivar abonado')).toBeTruthy())

    await waitFor(() => {
      expect(screen.getByText(/Se generarán/)).toBeTruthy()
    })

    // Dialog abierto: único "Reactivar" accesible es el confirm del dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => {
      expect(vi.mocked(reactivateAbonadoAction)).toHaveBeenCalledWith(PAUSED_ABONADO.id)
    })
  })

  it('pasa el endsOn del abonado (YYYY-MM-DD) al preview (#15)', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
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

    render(<AbonadosList abonados={[withEnd]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(vi.mocked(previewAbonadoSlotsAction)).toHaveBeenCalledWith(
        expect.objectContaining({
          courtId: withEnd.courtId,
          startsOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          endsOn: '2026-06-30',
        }),
      )
    })
  })

  it('pasa endsOn: undefined cuando el abonado no tiene fecha de fin (#15)', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: ['2026-06-01'],
      conflicts: [],
    })

    // PAUSED_ABONADO tiene endsOn: null (default de makeAbonado)
    render(<AbonadosList abonados={[PAUSED_ABONADO]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]!)

    await waitFor(() => {
      expect(vi.mocked(previewAbonadoSlotsAction)).toHaveBeenCalledTimes(1)
    })
    const [arg] = vi.mocked(previewAbonadoSlotsAction).mock.calls[0]!
    expect(arg.endsOn).toBeUndefined()
  })
})
