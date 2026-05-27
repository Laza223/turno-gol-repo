// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// Mock server actions before importing AbonadoForm
vi.mock('@/app/(admin)/abonados/nuevo/actions', () => ({
  submitNewAbonado: vi.fn(),
  previewAbonadoSlotsAction: vi.fn(),
}))

// Mock react-dom server hooks (useFormState / useFormStatus)
vi.mock('react-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-dom')>()
  return {
    ...original,
    useFormState: (_action: unknown, init: unknown) => [init, _action],
    useFormStatus: () => ({ pending: false }),
  }
})

import AbonadoForm, { PreviewSlotsView } from '@/app/(admin)/abonados/nuevo/AbonadoForm'
import { previewAbonadoSlotsAction } from '@/app/(admin)/abonados/nuevo/actions'

const mockCourts = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Cancha A' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'Cancha B' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', name: 'Cancha C' },
]

const MOCK_DATES = [
  '2026-06-01',
  '2026-06-08',
  '2026-06-15',
  '2026-06-22',
  '2026-06-29',
  '2026-07-06',
  '2026-07-13',
  '2026-07-20',
]
const MOCK_CONFLICTS = ['2026-06-08']

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

function fillFormAndSubmit() {
  const form = document.querySelector('form')!

  fireEvent.change(screen.getByRole('combobox', { name: /Cancha/i }), {
    target: { value: mockCourts[0]!.id },
  })
  fireEvent.change(form.querySelector('input[name="timeStart"]') as HTMLInputElement, {
    target: { value: '10:00' },
  })
  fireEvent.change(form.querySelector('input[name="timeEnd"]') as HTMLInputElement, {
    target: { value: '11:00' },
  })
  fireEvent.change(form.querySelector('input[name="contactName"]') as HTMLInputElement, {
    target: { value: 'Grupo Test' },
  })
  fireEvent.change(form.querySelector('input[name="contactPhone"]') as HTMLInputElement, {
    target: { value: '1199887766' },
  })
  fireEvent.change(form.querySelector('input[name="pricePerSession"]') as HTMLInputElement, {
    target: { value: '5000' },
  })
  fireEvent.change(form.querySelector('input[name="monthlyPrice"]') as HTMLInputElement, {
    target: { value: '20000' },
  })
  fireEvent.change(form.querySelector('input[name="startsOn"]') as HTMLInputElement, {
    target: { value: '2026-06-01' },
  })

  fireEvent.submit(form)
}

describe('AbonadoForm — preview phase', () => {
  it('shows phase 2 after successful preview call with correct badges and summary', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    render(<AbonadoForm courts={mockCourts} />)
    fillFormAndSubmit()

    // Wait for phase 2 heading
    await waitFor(() => {
      expect(screen.getByText('Vista previa de slots')).toBeTruthy()
    })

    // Assert all 8 dates are rendered
    for (const d of MOCK_DATES) {
      expect(screen.getByText(d)).toBeTruthy()
    }

    // 7 OK badges, 1 Conflicto badge
    const allOKBadges = screen.getAllByText('OK')
    expect(allOKBadges).toHaveLength(MOCK_DATES.length - MOCK_CONFLICTS.length)

    const conflictBadges = screen.getAllByText('Conflicto')
    expect(conflictBadges).toHaveLength(MOCK_CONFLICTS.length)

    // Summary text
    expect(
      screen.getByText('Se crearán 7 slots. 1 fecha(s) con conflicto se saltarán.'),
    ).toBeTruthy()

    // Confirm button enabled
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar creación' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(false)

    // Back button present
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy()
  })

  it('returns to form phase when "Volver a editar" is clicked', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    render(<AbonadoForm courts={mockCourts} />)
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vista previa de slots' })).toBeTruthy()
    })
  })

  it('disables confirm and shows warning when all dates conflict', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08'],
      conflicts: ['2026-06-01', '2026-06-08'],
    })

    render(<AbonadoForm courts={mockCourts} />)
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    expect(screen.getByText(/No se generarán slots/)).toBeTruthy()

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar creación' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })

  it('shows inline error when previewAbonadoSlotsAction returns failure', async () => {
    vi.mocked(previewAbonadoSlotsAction).mockResolvedValue({
      success: false,
      error: 'Tenant no encontrado.',
    })

    render(<AbonadoForm courts={mockCourts} />)
    fillFormAndSubmit()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Tenant no encontrado.')
    })

    // Should remain on form phase
    expect(screen.getByRole('button', { name: /Vista previa/i })).toBeTruthy()
  })
})

// ─── Isolated PreviewSlotsView subcomponent test ────────────────────────────
describe('PreviewSlotsView — isolated', () => {
  it('renders 8 rows with correct badge counts and summary', () => {
    render(
      <PreviewSlotsView
        dates={MOCK_DATES}
        conflicts={MOCK_CONFLICTS}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
        isConfirming={false}
      />,
    )

    expect(screen.getAllByText('OK')).toHaveLength(7)
    expect(screen.getAllByText('Conflicto')).toHaveLength(1)
    expect(
      screen.getByText('Se crearán 7 slots. 1 fecha(s) con conflicto se saltarán.'),
    ).toBeTruthy()
  })
})
