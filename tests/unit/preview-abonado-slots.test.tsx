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

// Cancha / Hora inicio / Hora fin son ahora un Combobox custom (patrón ARIA
// 1.2: input role="combobox" + listbox propio, ver src/components/ui/combobox.tsx),
// no un <select> nativo — ya no aceptan un fireEvent.change directo con el
// value crudo. Hay que abrir la lista (click en el input) y clickear la
// opción por su label visible.
async function selectCombobox(labelName: RegExp, optionName: string) {
  const combo = screen.getByRole('combobox', { name: labelName })
  fireEvent.click(combo)
  const option = await screen.findByRole('option', { name: optionName })
  fireEvent.click(option)
}

// "Empieza el" (startsOn) es un DatePicker con calendario propio (botón +
// diálogo Radix), no un <input type="date">. "Hoy" evita tener que navegar
// el calendario a un mes fijo (no controlamos el reloj del test).
async function selectStartsOnToday() {
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar fecha' }))
  const hoy = await screen.findByRole('button', { name: 'Hoy' })
  fireEvent.click(hoy)
}

async function fillFormAndSubmit() {
  const form = document.querySelector('form')!

  await selectCombobox(/Cancha/i, 'Cancha A')
  // Elegir "10:00" en Hora inicio auto-completa Hora fin a "11:00"
  // (onChange de Hora inicio llama addOneHour) — justo el valor que
  // este helper necesita, sin tocar el combobox de Hora fin aparte.
  await selectCombobox(/Hora inicio/i, '10:00')
  await selectStartsOnToday()

  fireEvent.change(form.querySelector('input[name="contactName"]') as HTMLInputElement, {
    target: { value: 'Grupo Test' },
  })
  // PhoneInput serializa vía un <input type="hidden"> espejo (sin onChange)
  // que solo refleja el estado interno del componente — hay que tipear en el
  // input VISIBLE (por label), no pisar el hidden a mano (un re-render por
  // cualquier otro campo controlado lo resetea al valor real del componente).
  fireEvent.change(screen.getByLabelText(/Tel[eé]fono/i), {
    target: { value: '1199887766' },
  })
  fireEvent.change(form.querySelector('input[name="pricePerSession"]') as HTMLInputElement, {
    target: { value: '5000' },
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

    await selectCombobox(/Cancha/i, 'Cancha A')
    await selectCombobox(/Hora inicio/i, '23:00')
    // El auto-link de "Hora inicio" ya deja Hora fin en "00:00"
    // (addOneHour('23:00')), pero se selecciona explícito acá para no
    // depender de ese efecto lateral y mantener el intent del test claro:
    // el admin elige "00:00" para decir "hasta medianoche".
    await selectCombobox(/Hora fin/i, '00:00')
    await selectStartsOnToday()

    fireEvent.change(form.querySelector('input[name="contactName"]') as HTMLInputElement, {
      target: { value: 'Grupo Medianoche' },
    })
    fireEvent.change(screen.getByLabelText(/Tel[eé]fono/i), {
      target: { value: '1199887766' },
    })
    fireEvent.change(form.querySelector('input[name="pricePerSession"]') as HTMLInputElement, {
      target: { value: '5000' },
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
      expect(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' }))

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
    await fillFormAndSubmit()

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
    await fillFormAndSubmit()

    // Wait for phase 2 heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Vista previa de fechas' })).toBeTruthy()
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

    // Summary: badge de turnos libres + aviso de fechas en conflicto
    expect(screen.getByText('7 turnos libres')).toBeTruthy()
    expect(
      screen.getByText(/Hay 1 fecha que ya está ocupada por otra reserva\./),
    ).toBeTruthy()

    // Confirm button enabled
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar y Crear Abonado' }) as HTMLButtonElement
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
    await fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy()
    })
  })

  it('disables confirm and shows warning when all dates conflict', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: true,
      dates: ['2026-06-01', '2026-06-08'],
      conflicts: ['2026-06-01', '2026-06-08'],
    })

    renderForm()
    await fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    expect(screen.getByText(/No se creará ningún turno/)).toBeTruthy()

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar y Crear Abonado' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })

  it('shows inline error when previewAbonadoSlotsAction returns failure', async () => {
    previewAbonadoSlotsAction.mockResolvedValue({
      success: false,
      error: 'Tenant no encontrado.',
    })

    renderForm()
    await fillFormAndSubmit()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Tenant no encontrado.')
    })

    // Should remain on form phase.
    // findByRole y no getByRole: React 19 hizo las transiciones async de verdad, así
    // que el botón vuelve de su estado pending un tick después de que el error ya
    // está en el DOM. Si nunca vuelve, el findByRole expira y el test falla igual.
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeTruthy()
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
    await fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' }))

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
    // PhoneInput antepone el prefijo del país seleccionado (default Argentina).
    expect((fd as FormData).get('contactPhone')).toBe('+54 1199887766')
    expect((fd as FormData).get('pricePerSession')).toBe('5000')
    // startsOn viene de "Hoy" (DatePicker) — no se controla la fecha exacta,
    // solo que el formato sobrevive a la reconstrucción de FormData.
    expect((fd as FormData).get('startsOn')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // paymentMethod: el campo se sacó del formulario (el server lo defaultea a
    // 'cash' vía Zod, ver actions.ts) — ya no viaja en el FormData del cliente.
    expect((fd as FormData).get('paymentMethod')).toBeNull()
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
    await fillFormAndSubmit()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Crear Abonado' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Conflicto al crear')
    })

    // Should be back on form phase.
    // findByRole y no getByRole: React 19 hizo las transiciones async de verdad, así
    // que el botón vuelve de su estado pending un tick después de que el error ya
    // está en el DOM (mismo motivo documentado arriba, en "shows inline error...").
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeTruthy()
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
    expect(screen.getByText('7 turnos libres')).toBeTruthy()
    expect(
      screen.getByText(/Hay 1 fecha que ya está ocupada por otra reserva\./),
    ).toBeTruthy()
  })
})
