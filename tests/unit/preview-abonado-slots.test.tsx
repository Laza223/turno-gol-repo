// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

import AbonadoForm, { PreviewSlotsView } from '@/app/(admin)/abonados/nuevo/AbonadoForm'

// submitAction/previewAction ya no se importan del módulo — AbonadoForm las
// recibe por prop (ver el comentario en AbonadoForm.tsx). Mocks locales.
const submitNewAbonado = vi.fn()
const previewAbonadoSlotsAction = vi.fn()

function renderForm() {
  return render(
    <AbonadoForm
      courts={mockCourts}
      submitAction={submitNewAbonado}
      previewAction={previewAbonadoSlotsAction}
    />,
  )
}

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
  fireEvent.change(form.querySelector('input[name="startsOn"]') as HTMLInputElement, {
    target: { value: '2026-06-01' },
  })

  fireEvent.submit(form)
}

describe('AbonadoForm — normaliza fin de turno a medianoche (ENS-13)', () => {
  it('normaliza timeEnd "00:00" a "24:00" antes de llamar a previewAction', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    renderForm()
    const form = document.querySelector('form')!

    fireEvent.change(screen.getByRole('combobox', { name: /Cancha/i }), {
      target: { value: mockCourts[0]!.id },
    })
    fireEvent.change(form.querySelector('input[name="timeStart"]') as HTMLInputElement, {
      target: { value: '23:00' },
    })
    // El input type="time" nativo nunca produce "24:00" — el admin elige
    // "00:00" para decir "hasta medianoche" y el form lo normaliza.
    fireEvent.change(form.querySelector('input[name="timeEnd"]') as HTMLInputElement, {
      target: { value: '00:00' },
    })
    fireEvent.change(form.querySelector('input[name="contactName"]') as HTMLInputElement, {
      target: { value: 'Grupo Medianoche' },
    })
    fireEvent.change(form.querySelector('input[name="contactPhone"]') as HTMLInputElement, {
      target: { value: '1199887766' },
    })
    fireEvent.change(form.querySelector('input[name="pricePerSession"]') as HTMLInputElement, {
      target: { value: '5000' },
    })
    fireEvent.change(form.querySelector('input[name="startsOn"]') as HTMLInputElement, {
      target: { value: '2026-06-01' },
    })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(previewAbonadoSlotsAction).toHaveBeenCalledTimes(1)
    })

    expect(previewAbonadoSlotsAction).toHaveBeenCalledWith(
      expect.objectContaining({ timeStart: '23:00', timeEnd: '24:00' }),
    )

    // La confirmación posterior también debe mandar '24:00', no '00:00'.
    submitNewAbonado.mockResolvedValue({ status: 'idle' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear abonado' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear abonado' }))

    await waitFor(() => {
      expect(submitNewAbonado).toHaveBeenCalledTimes(1)
    })
    const [, fd] = submitNewAbonado.mock.calls[0]!
    expect((fd as FormData).get('timeEnd')).toBe('24:00')
  })

  it('no toca un timeEnd normal (11:00 queda igual)', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      expect(previewAbonadoSlotsAction).toHaveBeenCalledTimes(1)
    })
    expect(previewAbonadoSlotsAction).toHaveBeenCalledWith(
      expect.objectContaining({ timeEnd: '11:00' }),
    )
  })
})

describe('AbonadoForm — preview phase', () => {
  it('shows phase 2 after successful preview call with correct badges and summary', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    renderForm()
    fillFormAndSubmit()

    // Wait for phase 2 heading
    await waitFor(() => {
      expect(screen.getByText('Fechas del turno fijo')).toBeTruthy()
    })

    // Assert all 8 dates are rendered
    for (const d of MOCK_DATES) {
      expect(screen.getByText(d)).toBeTruthy()
    }

    // 7 OK badges, 1 Conflicto badge
    const allOKBadges = screen.getAllByText('Libre')
    expect(allOKBadges).toHaveLength(MOCK_DATES.length - MOCK_CONFLICTS.length)

    const conflictBadges = screen.getAllByText('Ocupado')
    expect(conflictBadges).toHaveLength(MOCK_CONFLICTS.length)

    // Summary text
    expect(
      screen.getByText('Se crearán 7 turnos. 1 fecha ya está ocupada y se va a saltar.'),
    ).toBeTruthy()

    // Confirm button enabled
    const confirmBtn = screen.getByRole('button', { name: 'Crear abonado' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(false)

    // Back button present
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy()
  })

  it('returns to form phase when "Volver a editar" is clicked', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ver fechas del turno' })).toBeTruthy()
    })
  })

  it('disables confirm and shows warning when all dates conflict', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08'],
      conflicts: ['2026-06-01', '2026-06-08'],
    })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    expect(screen.getByText(/No se va a crear ningún turno/)).toBeTruthy()

    const confirmBtn = screen.getByRole('button', { name: 'Crear abonado' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })

  it('shows inline error when previewAbonadoSlotsAction returns failure', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: false,
      error: 'Tenant no encontrado.',
    })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Tenant no encontrado.')
    })

    // Should remain on form phase.
    // findByRole y no getByRole: React 19 hizo las transiciones async de verdad, así
    // que el botón vuelve de su estado pending un tick después de que el error ya
    // está en el DOM. Si nunca vuelve, el findByRole expira y el test falla igual.
    expect(await screen.findByRole('button', { name: /Ver fechas/i })).toBeTruthy()
  })

  it('calls submitNewAbonado with reconstructed FormData when "Crear abonado" clicked', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })
    // submitNewAbonado succeeds → component does redirect() server-side (no state update)
    submitNewAbonado.mockResolvedValue({ status: 'idle' })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear abonado' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Crear abonado' }))

    await waitFor(() => {
      expect(submitNewAbonado).toHaveBeenCalledTimes(1)
    })

    // Verify the FormData reconstruction preserves all submitted values
    const [, fd] = submitNewAbonado.mock.calls[0]!
    expect(fd).toBeInstanceOf(FormData)
    expect((fd as FormData).get('courtId')).toBe(mockCourts[0]!.id)
    expect((fd as FormData).get('timeStart')).toBe('10:00')
    expect((fd as FormData).get('timeEnd')).toBe('11:00')
    expect((fd as FormData).get('contactName')).toBe('Grupo Test')
    expect((fd as FormData).get('contactPhone')).toBe('1199887766')
    expect((fd as FormData).get('pricePerSession')).toBe('5000')
    expect((fd as FormData).get('startsOn')).toBe('2026-06-01')
    expect((fd as FormData).get('paymentMethod')).toBe('cash')
  })

  it('returns to form phase with error when submitNewAbonado returns error', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: MOCK_DATES,
      conflicts: MOCK_CONFLICTS,
    })
    submitNewAbonado.mockResolvedValue({
      status: 'error',
      message: 'Conflicto al crear',
    })

    renderForm()
    fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear abonado' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Crear abonado' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Conflicto al crear')
    })

    // Should be back on form phase
    expect(screen.getByRole('button', { name: /Ver fechas/i })).toBeTruthy()
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

    expect(screen.getAllByText('Libre')).toHaveLength(7)
    expect(screen.getAllByText('Ocupado')).toHaveLength(1)
    expect(
      screen.getByText('Se crearán 7 turnos. 1 fecha ya está ocupada y se va a saltar.'),
    ).toBeTruthy()
  })
})
