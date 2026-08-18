// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { GridBooking } from '@/lib/booking/grid-cells'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// La grilla es "hoy 2026-06-10 12:00 ART": renderizar con date futura deja
// todos los slots interactivos; renderizar con date = hoy marca pasados.
vi.mock('@/hooks/use-art-now', () => ({
  useArtNow: () => ({ date: '2026-06-10', time: '12:00' }),
}))

vi.mock('@/hooks/use-booking-realtime', () => ({
  useBookingRealtime: (opts: { initialBookings: GridBooking[] }) => ({
    bookings: opts.initialBookings,
    status: 'SUBSCRIBED',
    refetch: vi.fn(),
  }),
}))

// BookingFormModal entra por next/dynamic: lo reemplazamos por un stub que
// expone el slot recibido para asertar fecha+hora pre-llenadas.
vi.mock('next/dynamic', () => ({
  default: () =>
    function MockBookingFormModal(props: {
      slot: { courtName: string; date: string; timeStart: string }
      open: boolean
    }) {
      if (!props.open) return null
      return (
        <div
          role="dialog"
          // testid propio: desde Fase 3 el popover de alta rápida también es
          // `role="dialog"` (Radix Popover), así que "hay un dialog" ya no
          // distingue cuál de los dos se abrió.
          data-testid="booking-form-modal"
          data-date={props.slot.date}
          data-time={props.slot.timeStart}
        >
          {props.slot.courtName}
        </div>
      )
    },
}))

import { BookingGrid } from '@/components/booking/BookingGrid'

afterEach(() => cleanup())

const OPENING: OpeningHours = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00' },
}

function court(id: string, name: string, status: 'online' | 'offline' = 'online'): CourtRow {
  return {
    id,
    tenantId: 'tenant-1',
    name,
    description: null,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    hasLighting: true,
    format: 5,
    capacity: 10,
    photos: [],
    status,
    // Tarifa real: el popover de alta rápida muestra el precio ya resuelto, así
    // que sin reglas no habría nada que asertar.
    pricing: {
      rules: [
        {
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          from: '08:00',
          to: '23:00',
          price: 2400000,
        },
      ],
    },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function booking(over: Partial<GridBooking>): GridBooking {
  return {
    id: 'b1',
    courtId: 'c1',
    date: '2026-06-12',
    timeStart: '16:00',
    timeEnd: '17:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Tomás',
    playerLastName: 'García',
    priceSnapshot: 2000000,
    ...over,
  }
}

/**
 * Acciones del panel lateral. Sin ellas el panel abre pero NO renderiza ningún
 * botón, así que cualquier assertion de "no ofrece tal acción" pasaría vacía —
 * por eso se pasan siempre salvo que un test las quite a propósito.
 */
const panelActions = () => ({
  chargeDebtAction: vi.fn(async () => ({ success: true as const })),
  completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
  addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
  markNoShowAction: vi.fn(async () => ({ success: true as const })),
  revertNoShowAction: vi.fn(async () => ({ success: true as const })),
  listRescheduleSlotsAction: vi.fn(async () => ({
    success: true as const,
    slots: [],
    minDate: '2026-06-10',
    maxDate: '2026-06-16',
  })),
  rescheduleBookingAction: vi.fn(async () => ({ success: true as const })),
})

function renderGrid(opts?: {
  courts?: CourtRow[]
  bookings?: GridBooking[]
  date?: string
  /** Presente = alta rápida activa (el click de una celda libre abre el popover). */
  depositPercentage?: number
  action?: ReturnType<typeof vi.fn>
  checkAvailabilityAction?: ReturnType<typeof vi.fn>
  searchPlayersAction?: ReturnType<typeof vi.fn>
}) {
  return render(
    <BookingGrid
      courts={opts?.courts ?? [court('c1', 'Cancha 1'), court('c2', 'Cancha 2')]}
      initialBookings={opts?.bookings ?? []}
      date={opts?.date ?? '2026-06-12'}
      tenantId="tenant-1"
      openingHours={OPENING}
      closedDates={[]}
      closesNextDay={false}
      // next/dynamic está mockeado más abajo con un stub que ignora `action`
      // (el modal real no se monta en estos tests).
      action={opts?.action ?? vi.fn()}
      checkAvailabilityAction={opts?.checkAvailabilityAction}
      searchPlayersAction={opts?.searchPlayersAction}
      depositPercentage={opts?.depositPercentage}
      slotPanelActions={panelActions()}
      // El diálogo de cantina llega inyectado (vive bajo la ruta porque reusa
      // el TicketPanel de /caja). Acá alcanza con un stub: lo que se testea es
      // si el panel OFRECE la acción, no lo que hay adentro del diálogo.
      renderCanteenDialog={({ open }) => (open ? <div data-testid="canteen-dialog" /> : null)}
    />,
  )
}

describe('BookingGrid — layout CSS Grid', () => {
  it('renderiza un header por cancha (1 y 8 canchas)', () => {
    renderGrid({ courts: [court('c1', 'Única')] })
    expect(screen.getByText('Única')).toBeTruthy()
    cleanup()

    const eight = Array.from({ length: 8 }, (_, i) => court(`c${i}`, `Cancha ${i + 1}`))
    renderGrid({ courts: eight })
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`Cancha ${i}`)).toBeTruthy()
    }
  })

  it('click en slot libre abre el modal con fecha y hora pre-llenadas', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('data-date')).toBe('2026-06-12')
    expect(dialog.getAttribute('data-time')).toBe('16:00')
    expect(dialog.textContent).toContain('Cancha 1')
  })

  it('una reserva confirmada muestra nombre y estado "Confirmada"', () => {
    renderGrid({ bookings: [booking({})] })
    // within(grid): la leyenda de abajo repite los nombres de estado.
    const grid = within(screen.getByTestId('booking-grid'))
    expect(grid.getByText('Tomás García')).toBeTruthy()
    expect(grid.getByText('Confirmada')).toBeTruthy()
    // El slot ocupado no ofrece botón de reservar.
    expect(screen.queryByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' })).toBeNull()
  })

  it('abonado se distingue de reserva y de bloqueo', () => {
    renderGrid({
      bookings: [
        booking({ id: 'b1', type: 'fixed', timeStart: '16:00', timeEnd: '17:00' }),
        booking({
          id: 'b2',
          type: 'block',
          timeStart: '18:00',
          timeEnd: '19:00',
          playerFirstName: null,
        }),
      ],
    })
    const grid = within(screen.getByTestId('booking-grid'))
    expect(grid.getByText('Abonado')).toBeTruthy()
    expect(grid.getByText('Bloqueado')).toBeTruthy()
  })

  it('una reserva de 120 min ocupa dos filas (span 2) y no duplica celdas', () => {
    renderGrid({ bookings: [booking({ timeStart: '16:00', timeEnd: '18:00' })] })
    // Desde Fase 3 el placement vive en el propio botón: el slot ocupado ya no
    // necesita un div envolvente (el panel lateral reemplazó al popover que
    // colgaba de él), y es un nodo menos por celda en la vista más densa.
    const cell = screen.getByLabelText(/Cancha 1 16:00–18:00/) as HTMLElement
    // Fila de header = 1; slot 16:00 con apertura 08:00 es la fila 10.
    expect(cell.style.gridRow).toBe('10 / span 2')
    // El slot 17:00 de esa cancha quedó cubierto: no hay botón libre.
    expect(screen.queryByRole('button', { name: 'Reservar turno 17:00 en Cancha 1' })).toBeNull()
  })

  it('los slots pasados no son clickeables', () => {
    // date = hoy (2026-06-10), artNow 12:00 → 08:00 pasado, 16:00 futuro.
    renderGrid({ date: '2026-06-10' })
    expect(screen.queryByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' })).toBeTruthy()
  })

  it('las flechas mueven el foco entre slots', () => {
    renderGrid()
    const first = screen.getByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' })
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 09:00 en Cancha 1',
    )

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 09:00 en Cancha 2',
    )
  })

  it('las flechas recorren también los slots ocupados y saltan filas cubiertas', () => {
    renderGrid({ bookings: [booking({ timeStart: '09:00', timeEnd: '11:00' })] })
    const first = screen.getByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' })
    first.focus()

    // 09:00 está ocupado: el foco entra a la reserva (también es botón).
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toContain('09:00–11:00')

    // 10:00 está cubierto por el span → el siguiente foco es 11:00.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 11:00 en Cancha 1',
    )
  })
})

// Contrato Radix (Paso 3 blueprint mobile): el detalle abre por CLICK/tap
// (PopoverTrigger — en touch no hay hover ni focus confiable) y por hover con
// intent en desktop. El contenido es role="dialog" portaled (ya no un panel
// absolute role="tooltip" clipeado por el overflow del scroller).
/**
 * Fase 3: el popover de sólo-lectura que abría por hover se reemplazó por un
 * panel lateral con detalle Y acciones. El hover se fue a propósito (no existe
 * en touch, y el mostrador usa tablet), así que ya no hay un caso de "hover
 * abre" que testear: abre por click/tap/Enter, como en cualquier dispositivo.
 */
describe('BookingGrid — panel de acciones del turno', () => {
  const paid = booking({
    paymentMethod: 'cash',
    depositStatus: 'paid',
    depositAmount: 500000,
    priceSnapshot: 2000000,
  })

  it('click/tap en un slot ocupado abre el panel con quién reservó, precio y método', async () => {
    renderGrid({ bookings: [paid] })
    const slot = screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ })

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(slot)

    const panel = await screen.findByRole('dialog')
    expect(slot.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('Tomás García')
    expect(panel.textContent).toContain('Cancha 1')
    expect(panel.textContent).toContain('Efectivo')
    expect(panel.textContent).toContain('20.000') // precio del turno
  })

  it('Escape cierra el panel', async () => {
    renderGrid({ bookings: [paid] })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('muestra el saldo pendiente cuando lo conoce, y no lo inventa cuando no', async () => {
    renderGrid({
      bookings: [booking({ priceSnapshot: 2000000, totalPaid: 500000, pending: 1500000 })],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(panel.textContent).toContain('Pendiente')
    expect(panel.textContent).toContain('15.000')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  /**
   * artNow del mock = 2026-06-10 12:00, así que un turno de 08:00 de ESE día ya
   * terminó. Es la única forma de que el panel ofrezca "Marcar ausente" — sin
   * este control positivo, los dos tests de abajo (que verifican que NO se
   * ofrece) pasarían aunque el botón no existiera nunca.
   */
  const YA_TERMINO = { date: '2026-06-10', timeStart: '08:00', timeEnd: '09:00' } as const

  it('un turno confirmado que ya terminó SÍ ofrece marcar ausente (control positivo)', async () => {
    renderGrid({
      date: YA_TERMINO.date,
      bookings: [booking({ ...YA_TERMINO, pending: 2000000, totalPaid: 0 })],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 08:00–09:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /Marcar ausente/ })).toBeTruthy()
  })

  it('un bloqueo que ya terminó no ofrece cobrar ni marcar ausente', async () => {
    renderGrid({
      date: YA_TERMINO.date,
      bookings: [
        booking({
          ...YA_TERMINO,
          type: 'block',
          playerFirstName: null,
          guestName: null,
          pending: 0,
          totalPaid: 0,
        }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 08:00–09:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(panel.textContent).toContain('Bloqueado')
    expect(within(panel).queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /Cobrar/ })).toBeNull()
  })

  it('una hora de torneo que ya terminó tampoco: no hay a quién dar por ausente', async () => {
    renderGrid({
      date: YA_TERMINO.date,
      bookings: [
        booking({
          ...YA_TERMINO,
          type: 'tournament',
          playerFirstName: null,
          guestName: 'Torneo Apertura',
          priceSnapshot: 0,
          pending: 0,
          totalPaid: 0,
        }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 08:00–09:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(panel.textContent).toContain('Torneo')
    expect(within(panel).queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /Cargar cantina/ })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /Reprogramar/ })).toBeNull()
  })

  it('un turno confirmado ofrece cargar cantina y reprogramar', async () => {
    renderGrid({ bookings: [booking({ pending: 2000000, totalPaid: 0 })] })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Reprogramar/ })).toBeTruthy()
  })

  /**
   * `rescheduleBooking` sólo acepta confirmed/pending_payment: ofrecer el botón
   * sobre un turno ya jugado sería prometer algo que el backend rechaza. La
   * cantina en cambio SÍ sigue disponible — lo normal es consumir durante el
   * partido y pagar todo junto al final.
   */
  it('un turno ya jugado sigue ofreciendo cantina pero no reprogramar', async () => {
    renderGrid({
      date: YA_TERMINO.date,
      bookings: [booking({ ...YA_TERMINO, status: 'completed', totalPaid: 2000000, pending: 0 })],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 08:00–09:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: /Reprogramar/ })).toBeNull()
  })

  /**
   * Una sesión de abonado (`type='fixed'`, `status='confirmed'`) SÍ ofrece
   * "Reprogramar" desde la decisión del dueño del 2026-08-05. Estuvo bloqueada
   * desde la revisión adversarial de T7 porque moverla recalculaba el precio
   * contra la grilla de tarifas y le pisaba al cliente el del contrato; ahora el
   * backend conserva el `price_snapshot` pactado (`booking.reschedule.ts`, rama
   * `type === 'fixed'`), así que el botón dejó de prometer algo que rompía.
   */
  it('una sesión de abonado ofrece cantina Y reprogramar', async () => {
    renderGrid({ bookings: [booking({ type: 'fixed', pending: 2000000, totalPaid: 0 })] })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Reprogramar/ })).toBeTruthy()
  })

  it('un bloqueo no ofrece cantina ni reprogramar: no es el turno de nadie', async () => {
    renderGrid({
      bookings: [
        booking({
          type: 'block',
          playerFirstName: null,
          guestName: null,
          pending: 0,
          totalPaid: 0,
        }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: /Cargar cantina/ })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /Reprogramar/ })).toBeNull()
  })

  it('el diálogo de cantina se monta recién al tocar el botón', async () => {
    renderGrid({ bookings: [booking({ pending: 2000000, totalPaid: 0 })] })
    fireEvent.click(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const panel = await screen.findByRole('dialog')
    expect(screen.queryByTestId('canteen-dialog')).toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: /Cargar cantina/ }))
    expect(await screen.findByTestId('canteen-dialog')).toBeTruthy()
  })
})

/**
 * Fase 3, criterio de salida #3: el click de una celda libre abre un POPOVER de
 * alta rápida (≤3 campos visibles, precio ya resuelto, Enter confirma), no el
 * modal de 10 campos. El modal sigue existiendo intacto detrás de "Más opciones".
 */
describe('BookingGrid — popover de alta rápida', () => {
  const FREE = 'Reservar turno 16:00 en Cancha 1'

  it('sin depositPercentage se comporta como antes: la celda libre abre el modal', async () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: FREE }))
    const dialog = await screen.findByTestId('booking-form-modal')
    expect(dialog.getAttribute('data-time')).toBe('16:00')
    expect(screen.queryByLabelText('¿A nombre de quién?')).toBeNull()
  })

  it('abre el popover con el precio PRE-CALCULADO y sin pasar por el modal', async () => {
    renderGrid({ depositPercentage: 30 })
    fireEvent.click(screen.getByRole('button', { name: FREE }))

    expect(await screen.findByLabelText('¿A nombre de quién?')).toBeTruthy()
    // El precio sale de court.pricing en el cliente: $24.000, sin round-trip.
    expect(screen.getByText(/24\.000/)).toBeTruthy()
    // La seña sugerida es el 30% — se muestra antes de elegir método.
    expect(screen.getByText(/sugerida/)).toBeTruthy()
    // El modal completo NO se abrió.
    expect(screen.queryByTestId('booking-form-modal')).toBeNull()
  })

  it('Enter confirma: crea la reserva con el slot y el nombre tipeados', async () => {
    const action = vi.fn(async (_data: unknown) => ({ success: true, booking: { id: 'nueva' } }))
    renderGrid({ depositPercentage: 30, action })

    fireEvent.click(screen.getByRole('button', { name: FREE }))
    const input = await screen.findByLabelText('¿A nombre de quién?')
    fireEvent.change(input, { target: { value: 'Juan Telefónico' } })
    // Enter dentro del campo dispara el submit del form — es el criterio.
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0]![0]).toMatchObject({
      courtId: 'c1',
      date: '2026-06-12',
      timeStart: '16:00',
      timeEnd: '17:00',
      type: 'spontaneous',
      guestName: 'Juan Telefónico',
    })
    // Sin seña elegida, los tres campos de seña NO viajan.
    expect(action.mock.calls[0]![0]).not.toHaveProperty('depositMethod')
  })

  it('sin nombre no llama al server: avisa en el popover', async () => {
    const action = vi.fn(async (_data: unknown) => ({ success: true, booking: { id: 'x' } }))
    renderGrid({ depositPercentage: 30, action })

    fireEvent.click(screen.getByRole('button', { name: FREE }))
    const input = await screen.findByLabelText('¿A nombre de quién?')
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it('elegir un método de seña manda los TRES campos juntos, con el monto sugerido', async () => {
    const action = vi.fn(async (_data: unknown) => ({ success: true, booking: { id: 'x' } }))
    renderGrid({ depositPercentage: 30, action })

    fireEvent.click(screen.getByRole('button', { name: FREE }))
    const input = await screen.findByLabelText('¿A nombre de quién?')
    fireEvent.change(input, { target: { value: 'Con seña' } })
    // F-007: DepositFieldset ahora usa SegmentedControl (Radix RadioGroup) —
    // role="radio", no "button" (ese es justo el punto del fix).
    fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0]![0]).toMatchObject({
      depositMethod: 'cash',
      // 30% de $24.000 = $7.200 (calcDepositCents, la misma función del server).
      depositAmount: 720000,
      depositStatus: 'paid',
    })
  })

  /**
   * Un complejo con `deposit_percentage: 0` (no pide seña online — config válida
   * y la que trae el seed) hacía que el popover pre-cargara $0 y después
   * rechazara el submit: el atajo se volvía un callejón sin salida. Sin
   * sugerencia, el campo queda vacío y el admin tipea el monto.
   */
  it('con porcentaje 0 no sugiere seña ni pre-carga $0', async () => {
    renderGrid({ depositPercentage: 0 })
    fireEvent.click(screen.getByRole('button', { name: FREE }))
    await screen.findByLabelText('¿A nombre de quién?')

    expect(screen.queryByText(/sugerida/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
    const monto = screen.getByLabelText('Monto de la seña') as HTMLInputElement
    expect(monto.value).toBe('')
  })

  it('"Más opciones" abre el modal completo con el MISMO slot', async () => {
    renderGrid({ depositPercentage: 30 })
    fireEvent.click(screen.getByRole('button', { name: FREE }))
    await screen.findByLabelText('¿A nombre de quién?')

    fireEvent.click(screen.getByRole('button', { name: /Más opciones/ }))
    const dialog = await screen.findByTestId('booking-form-modal')
    expect(dialog.getAttribute('data-time')).toBe('16:00')
    expect(dialog.getAttribute('data-date')).toBe('2026-06-12')
  })

  /**
   * checkSlotAvailabilityAction es fail-open, así que un `false` es señal
   * POSITIVA de que el turno se ocupó. Sin mostrarlo, la carrera de doble
   * reserva quedaría sólo en el constraint de la DB y el admin vería el error
   * recién al confirmar.
   */
  it('si el turno se ocupó mientras tanto, avisa y bloquea el confirmar', async () => {
    const action = vi.fn(async (_data: unknown) => ({ success: true, booking: { id: 'x' } }))
    renderGrid({
      depositPercentage: 30,
      action,
      checkAvailabilityAction: vi.fn(async () => ({ available: false })),
    })

    fireEvent.click(screen.getByRole('button', { name: FREE }))
    expect(await screen.findByText(/acaba de ser tomado/)).toBeTruthy()
    const confirmar = screen.getByRole('button', { name: /Confirmar reserva/ })
    expect((confirmar as HTMLButtonElement).disabled).toBe(true)
  })

  it('un fallo del chequeo de disponibilidad NO bloquea el alta (fail-open)', async () => {
    renderGrid({
      depositPercentage: 30,
      checkAvailabilityAction: vi.fn(async () => {
        throw new Error('red caída')
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: FREE }))
    const confirmar = await screen.findByRole('button', { name: /Confirmar reserva/ })
    await waitFor(() => expect((confirmar as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/acaba de ser tomado/)).toBeNull()
  })
})
