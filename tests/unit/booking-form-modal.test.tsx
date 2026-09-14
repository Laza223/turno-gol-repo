// @vitest-environment happy-dom
/**
 * Modal único por tipo (pages/grilla.md §3bis, decisión 2026-09-14): payload
 * de cada tipo, defaults, y las reglas de plata que separan Turno/Evento de
 * Bloquear cancha.
 *
 * `TypePicker` duplica sus 4 opciones en dos controles (chips de teléfono +
 * columna de escritorio, resueltos por CSS): happy-dom no aplica CSS, así que
 * los DOS quedan en el DOM a la vez. El nombre accesible del chip (sin la
 * línea de ayuda) es más CORTO que el de la tarjeta de escritorio, así que un
 * `name` EXACTO ("Turno fijo") selecciona sólo el chip sin ambigüedad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, within } from '@testing-library/react'
import { generateTimeSlots } from '@/lib/booking/grid-cells'
import { BookingFormModal } from '@/components/booking/BookingFormModal'
import type { GridBooking } from '@/lib/booking/grid-cells'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

const createBookingAction = vi.fn()
const createAbonadoAction = vi.fn()

const pricing = {
  rules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '24:00', price: 1000000 },
    { days: ['sat', 'sun'], from: '08:00', to: '24:00', price: 1500000 },
  ],
}

const slot = {
  courtId: 'court-1',
  courtName: 'Cancha 1',
  date: '2026-03-16', // lunes
  timeStart: '18:00',
}

function renderModal(overrides: Partial<React.ComponentProps<typeof BookingFormModal>> = {}) {
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  const res = render(
    <BookingFormModal
      slot={slot}
      pricing={pricing}
      dayBookings={[]}
      daySlots={generateTimeSlots('08:00', '23:00')}
      isSlotPast={() => false}
      open
      onClose={onClose}
      onSuccess={onSuccess}
      createBookingAction={createBookingAction}
      createAbonadoAction={createAbonadoAction}
      {...overrides}
    />,
  )
  return { container: res.container, onClose, onSuccess }
}

function body() {
  return within(document.body)
}

function pickType(name: string) {
  fireEvent.click(body().getByRole('radio', { name }))
}

/**
 * `Summary` renderiza DOS veces el botón primario (card de escritorio + footer
 * de teléfono, resueltos por CSS) — en happy-dom, sin CSS, los dos quedan en
 * el DOM a la vez con el MISMO nombre accesible. El de escritorio es el
 * primero en el árbol (mismo criterio que el resto de la suite para DOM
 * duplicado: within + variante `All`).
 */
function submitButton(name: string | RegExp) {
  return body().getAllByRole('button', { name })[0]!
}

/** Mismo criterio que `submitButton`: `Summary` duplica el `role="alert"` de error. */
function alertText(): string {
  return body().getAllByRole('alert')[0]!.textContent ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingFormModal — Turno (default)', () => {
  it('arranca en Turno con el foco en el nombre', () => {
    renderModal()
    expect(document.activeElement).toBe(body().getByLabelText('¿A nombre de quién?'))
  })

  it('confirma con nombre + precio de la grilla, 60 min fijo', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(body().getByLabelText('¿A nombre de quién?'), { target: { value: 'Juan' } })
    fireEvent.click(submitButton(/Reservar/))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = createBookingAction.mock.calls[0]![0]
    expect(payload).toMatchObject({
      courtId: 'court-1',
      date: '2026-03-16',
      timeStart: '18:00',
      timeEnd: '19:00',
      type: 'spontaneous',
      guestName: 'Juan',
    })
    // El precio de la grilla NO se manda como override salvo que se edite
    // (botón "Cambiar"): el server lo recalcula solo.
    expect(payload).not.toHaveProperty('priceOverride')
  })

  it('confirmar manda kind + durationMs + withPlayer + withDeposit a la telemetría', async () => {
    const { track } = await import('@/shared/observability/breadcrumbs')
    const gridSpy = vi.spyOn(track, 'grid').mockImplementation(() => {})
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(body().getByLabelText('¿A nombre de quién?'), { target: { value: 'Juan' } })
    fireEvent.click(body().getByRole('radio', { name: 'Todo' }))
    fireEvent.click(submitButton(/Reservar/))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const confirmedCall = gridSpy.mock.calls.find(([ev]) => ev === 'create_modal.confirmed')
    expect(confirmedCall?.[1]).toMatchObject({
      kind: 'turno',
      withPlayer: false,
      withDeposit: true,
    })
    expect(confirmedCall?.[1]!.durationMs).toBeGreaterThanOrEqual(0)

    gridSpy.mockRestore()
  })

  it('sin nombre no llama al server', () => {
    renderModal()
    fireEvent.click(submitButton(/Reservar/))
    expect(createBookingAction).not.toHaveBeenCalled()
    expect(alertText()).toMatch(/Poné a nombre de quién/)
  })

  it('"Todo" precarga el monto igual al total y lo manda como seña pagada', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(body().getByLabelText('¿A nombre de quién?'), { target: { value: 'Juan' } })
    fireEvent.click(body().getByRole('radio', { name: 'Todo' }))
    fireEvent.click(submitButton(/Reservar/))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    expect(createBookingAction.mock.calls[0]![0]).toMatchObject({
      depositMethod: 'cash',
      depositAmount: 1000000,
      depositStatus: 'paid',
    })
  })

  it('"Todo" y después bajar el precio con "Cambiar": la seña se resincroniza, nunca lo supera', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(body().getByLabelText('¿A nombre de quién?'), { target: { value: 'Juan' } })
    fireEvent.click(body().getByRole('radio', { name: 'Todo' }))
    // Precio de la grilla ($10.000) baja a $5.000 DESPUÉS de precargar "Todo".
    fireEvent.click(body().getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(body().getByLabelText('Precio del turno'), { target: { value: '5000' } })
    fireEvent.click(submitButton(/Reservar/))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = createBookingAction.mock.calls[0]![0]
    expect(payload.priceOverride).toBe(500000)
    expect(payload.depositAmount).toBe(500000)
    expect(payload.depositAmount).toBeLessThanOrEqual(payload.priceOverride)
  })

  it('el fin de la próxima reserva de esa cancha tapa las opciones de horario', () => {
    const courtBookings: GridBooking[] = [
      {
        id: 'b-next',
        courtId: 'court-1',
        date: slot.date,
        timeStart: '19:00',
        timeEnd: '20:00',
        status: 'confirmed',
        type: 'spontaneous',
        guestName: 'Otro',
        playerFirstName: null,
        playerLastName: null,
        priceSnapshot: 1000000,
      },
    ]
    renderModal({ dayBookings: courtBookings })
    // Sólo el 18:00 queda libre antes de la próxima reserva — no hay otro
    // horario de inicio ofrecido más allá del actual.
    const startSelect = body().getByLabelText('Empieza') as HTMLSelectElement
    const options = Array.from(startSelect.options).map((o) => o.value)
    expect(options).not.toContain('19:00')
  })
})

describe('BookingFormModal — Turno fijo', () => {
  it('llama a createAbonadoAction con el día y horario del casillero', async () => {
    createAbonadoAction.mockResolvedValueOnce({
      success: true,
      abonado: { id: 'a1' },
      slotsGenerated: 8,
      conflictDates: [],
    })
    renderModal()
    pickType('Turno fijo')

    fireEvent.change(await body().findByLabelText('Nombre de contacto'), {
      target: { value: 'Julián' },
    })
    fireEvent.change(body().getByLabelText('Teléfono'), { target: { value: '11 2233-4455' } })
    fireEvent.click(submitButton('Crear turno fijo'))

    await waitFor(() => expect(createAbonadoAction).toHaveBeenCalled())
    expect(createAbonadoAction.mock.calls[0]![0]).toMatchObject({
      courtId: 'court-1',
      contactName: 'Julián',
      contactPhone: '+54 11 2233-4455',
      dayOfWeek: 1,
      timeStart: '18:00',
      startsOn: '2026-03-16',
    })
  })

  it('muestra las fechas en conflicto que devuelve el server', async () => {
    const { toast } = await import('@/hooks/use-toast')
    createAbonadoAction.mockResolvedValueOnce({
      success: true,
      abonado: { id: 'a1' },
      slotsGenerated: 6,
      conflictDates: ['2026-09-21'],
    })
    renderModal()
    pickType('Turno fijo')

    fireEvent.change(await body().findByLabelText('Nombre de contacto'), {
      target: { value: 'Julián' },
    })
    fireEvent.change(body().getByLabelText('Teléfono'), { target: { value: '11 2233-4455' } })
    fireEvent.click(submitButton('Crear turno fijo'))

    await waitFor(() => expect(toast).toHaveBeenCalled())
    const call = (toast as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(call.title).toBe('Turno fijo creado')
    expect(call.description).toContain('21/09')
  })
})

describe('BookingFormModal — Evento', () => {
  it('sin editar el precio sugerido, NO manda priceOverride', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()
    pickType('Evento')

    fireEvent.change(await body().findByLabelText('Nombre del evento o responsable'), {
      target: { value: 'Escuelita' },
    })
    fireEvent.click(submitButton(/Agendar evento/))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = createBookingAction.mock.calls[0]![0]
    expect(payload).toMatchObject({ type: 'spontaneous', guestName: 'Escuelita' })
    expect(payload).not.toHaveProperty('priceOverride')
  })

  it('"No se cobra" manda priceOverride 0 y esconde el cobro', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()
    pickType('Evento')

    fireEvent.change(await body().findByLabelText('Nombre del evento o responsable'), {
      target: { value: 'Escuelita' },
    })
    fireEvent.click(body().getByRole('radio', { name: 'No se cobra' }))
    expect(body().queryByText('¿Cobraste algo ahora?')).toBeNull()

    fireEvent.click(submitButton('Agendar evento'))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = createBookingAction.mock.calls[0]![0]
    expect(payload).toMatchObject({ priceOverride: 0 })
    expect(payload).not.toHaveProperty('depositMethod')
  })
})

describe('BookingFormModal — Bloquear cancha', () => {
  it('nunca manda precio, seña ni contacto', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()
    pickType('Bloquear cancha')

    fireEvent.click(submitButton('Bloquear cancha'))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = createBookingAction.mock.calls[0]![0]
    expect(payload).toMatchObject({ type: 'block', guestName: 'Mantenimiento' })
    expect(payload).not.toHaveProperty('priceOverride')
    expect(payload).not.toHaveProperty('depositMethod')
    expect(payload).not.toHaveProperty('depositAmount')
    expect(payload).not.toHaveProperty('guestPhone')
    expect(payload).not.toHaveProperty('playerId')
  })

  it('"Otro" pide un motivo a mano', async () => {
    renderModal()
    pickType('Bloquear cancha')
    fireEvent.click(body().getByRole('button', { name: 'Otro' }))
    fireEvent.click(submitButton('Bloquear cancha'))
    expect(createBookingAction).not.toHaveBeenCalled()
    expect(alertText()).toMatch(/motivo/)
  })
})
