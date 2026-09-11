import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  booking,
  bookingBlock,
  bookingCompleted,
  bookingConfirmedNoDeposit,
  bookingFixed,
  bookingNoShow,
  bookingPendingPayment,
  toGridBooking,
} from '@/test/fixtures/booking'
import { player, playerAlt } from '@/test/fixtures/player'
import { BookingCard } from './BookingCard'

/**
 * Componente más denso del sistema (status × pago × origen × plata → 1 estado
 * vía `gridSlotVisual()`). Se posiciona con `style={{ gridColumn, gridRow }}`
 * explícitos (`placement()`), así que fuera de un contenedor `display:grid`
 * el layout no se ve — se reproduce el grid de GridScroller (columna de horas
 * + 1 cancha, `bg-card` + borde redondeado) como decorator.
 */
const meta = {
  title: 'Booking/Grid/BookingCard',
  component: BookingCard,
  parameters: { layout: 'padded' },
  args: {
    booking: null,
    timeStart: '16:00',
    isPast: false,
    col: 0,
    row: 0,
    courtId: 'court-1',
    courtName: 'Cancha 1',
    onSlotClick: fn(),
    onDetailChange: fn(),
  },
  decorators: [
    (Story) => {
      return (
        <div
          className="grid rounded-xl border border-border bg-card shadow-xs"
          style={{
            gridTemplateColumns: '3.5rem 9rem',
            // Fila fija de 4rem: la grilla dejó de tener densidad configurable.
            gridTemplateRows: '2.75rem repeat(3, 4rem)',
            minWidth: '12.5rem',
          }}
        >
          <div
            aria-hidden
            style={{ gridColumn: 1, gridRow: 1 }}
            className="border-b border-border bg-card"
          />
          <div
            style={{ gridColumn: 2, gridRow: 1 }}
            className="flex items-center justify-center border-b border-border bg-card/95 text-xs font-semibold text-foreground"
          >
            Cancha 1
          </div>
          <div
            style={{ gridColumn: 1, gridRow: 2 }}
            className="flex items-start justify-end bg-card pr-2 pt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground"
          >
            16:00
          </div>
          <Story />
        </div>
      )
    },
  ],
} satisfies Meta<typeof BookingCard>

export default meta
type Story = StoryObj<typeof meta>

// ─── Slot libre ─────────────────────────────────────────────────────────────

export const LibreInteractivo: Story = {
  name: 'Libre — interactivo (Plus)',
}

export const LibrePasado: Story = {
  name: 'Libre — pasado (transparente, no clickeable)',
  args: { isPast: true },
}

export const LibreCanchaPausada: Story = {
  name: 'Libre — cancha offline (gris, sin onSlotClick/courtId)',
  args: { courtId: undefined, onSlotClick: undefined },
}

// ─── Ocupado: 1 story por estado de gridSlotVisual() ───────────────────────

export const Bloqueado: Story = {
  args: { booking: toGridBooking(bookingBlock()) },
}

export const Ausente: Story = {
  args: { booking: toGridBooking(bookingNoShow()) },
}

export const Jugada: Story = {
  args: {
    booking: { ...toGridBooking(bookingCompleted()), totalPaid: 800000, pending: 0 },
  },
}

/**
 * La ÚNICA alarma visual de la grilla (Fase 3): el turno se jugó y quedó plata
 * sin cobrar. Anillo rojo que respira + label "Sin cobrar". No se atenúa aunque
 * sea pasado — apagarlo sería apagar justo lo que pide atención.
 */
export const SinCobrar: Story = {
  args: {
    booking: { ...toGridBooking(bookingCompleted()), totalPaid: 0, pending: 800000 },
    isPast: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El saldo va en el aria-label y, desde el rediseño, también a la vista: al
    // costado del nombre y en el color del estado, no como tercera línea.
    await expect(canvas.getByLabelText(/, falta cobrar/)).toBeInTheDocument()
    // DOS nodos y uno solo visible: el monto vive arriba en escritorio y abajo en
    // el teléfono, y cuál se muestra lo decide el CSS. Se afirma la cuenta exacta
    // para que borrar uno de los dos rompa acá en vez de dejar un ancho sin saldo.
    await expect(canvas.getAllByText('$ 8.000')).toHaveLength(2)
  },
}

/**
 * Ausente que capturó la seña: NO alarma. En un no-show la seña es lo único
 * cobrable y ya se cobró — no hay nada que el staff pueda hacer.
 */
export const AusenteConSenaCapturada: Story = {
  args: {
    booking: { ...toGridBooking(bookingNoShow()), totalPaid: 240000, pending: 560000 },
  },
}

/**
 * Ausente que nunca tuvo seña: tampoco alarma. Un no-show nunca es cobrable
 * (veto "No-show NO es deuda", decisión del dueño 2026-09-09). `not_required`
 * + `depositAmount: 0` es lo que hace consistente el `totalPaid: 0` — un turno
 * `captured` con cero cobrado no puede existir.
 */
export const AusenteSinCobrar: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingNoShow()),
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 0,
      pending: 800000,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Control negativo: un no-show nunca es cobrable (veto "No-show NO es
    // deuda"), así que el aria-label no puede decir "falta cobrar" aunque
    // `pending` venga > 0.
    await expect(canvas.queryByLabelText(/falta cobrar/)).toBeNull()
  },
}

export const EsperandoSena: Story = {
  args: { booking: toGridBooking(bookingPendingPayment(), playerAlt()) },
}

/** `depositStatus: paid` — el fixture default ya sale así. */
export const Senada: Story = {
  args: { booking: toGridBooking(booking(), player()) },
}

export const Abonado: Story = {
  args: { booking: toGridBooking(bookingFixed(), playerAlt()) },
}

/** Confirmada sin seña (HandCoins): `depositStatus: not_required`, `type: spontaneous`. */
export const Confirmada: Story = {
  args: { booking: toGridBooking(bookingConfirmedNoDeposit(), playerAlt()) },
}

// ─── Modificadores visuales ─────────────────────────────────────────────────

export const Pasado: Story = {
  name: 'Reserva pasada (opacity + saturate)',
  args: { booking: toGridBooking(bookingCompleted()), isPast: true },
}

export const Nueva: Story = {
  name: 'Recién llegada por Realtime (animate-slot-pulse)',
  args: { booking: toGridBooking(booking(), player()), isNew: true },
}

/**
 * Chip "Por cobrar hoy" encendido: el turno que debe plata lleva anillo para
 * encontrarlo en una matriz llena. Es foco de pantalla, no estado del turno —
 * por eso no cambia ni el color ni el rótulo ni el aria-label.
 */
export const ResaltadaPorFoco: Story = {
  name: 'spotlighted=true (el chip "Por cobrar hoy" está encendido)',
  args: { booking: toGridBooking(booking(), player()), spotlighted: true },
}

export const DetalleAbierto: Story = {
  name: 'detailOpen=true (Popover de detalle)',
  args: { booking: toGridBooking(booking(), player()), detailOpen: true },
}

// ─── Interacción ────────────────────────────────────────────────────────────

export const ClickReservaSlotLibre: Story = {
  name: 'Click en slot libre dispara onSlotClick(courtId, timeStart)',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' }))
    await expect(args.onSlotClick).toHaveBeenCalledWith('court-1', '16:00')
  },
}

export const ClickAbreDetalle: Story = {
  name: 'Click en una reserva dispara onDetailChange(bookingId)',
  args: { booking: toGridBooking(booking(), player()) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    await expect(args.onDetailChange).toHaveBeenCalledWith(args.booking!.id)
  },
}
