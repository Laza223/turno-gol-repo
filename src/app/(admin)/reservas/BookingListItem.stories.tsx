import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { formatArs } from '@/lib/format'
import { artDateString } from '@/test/fixtures/clock'
import { uid } from '@/test/fixtures/ids'
import type { ReservaListRow } from './queries'
import { BookingListItem } from './BookingListItem'
import { agendaMoneyCell } from './money-line'
import { reservaHasEnded, reservaIsLive } from './status-visual'

/**
 * `formatArs` (Intl.NumberFormat) mete un NBSP (U+00A0) entre "$" y el número.
 * El normalizer default de `getByText` colapsa `\s+` del texto del DOM (NBSP
 * incluido) a un espacio simple, pero NO normaliza el string que uno le pasa
 * como matcher — así que hay que normalizarlo acá también o nunca matchea.
 */
const money = (cents: number): string => formatArs(cents).replace(/ /g, ' ')

/**
 * `ReservaListRow` es el shape que arma `queries.ts` vía JOIN (courts + players),
 * no `BookingRow` de la tabla — mismo patrón que `detail()` en
 * `BookingDetailCard.stories.tsx`: se construye a mano en vez de reusar los
 * fixtures de `src/test/fixtures/booking.ts`.
 */
const row = (overrides: Partial<ReservaListRow> = {}): ReservaListRow => ({
  id: uid(1002),
  date: artDateString(),
  timeStart: '19:00',
  timeEnd: '20:00',
  status: 'confirmed',
  type: 'spontaneous',
  courtName: 'Cancha 1',
  playerName: 'Julián Álvarez',
  guestName: null,
  phone: '+54 9 11 5555-1234',
  priceSnapshot: 1_500_000,
  depositAmount: 0,
  depositStatus: 'not_required',
  paymentMethod: null,
  ...overrides,
})

/** Recalcula el aria-label esperado con la MISMA lógica que BookingListItem.tsx (reusa `agendaMoneyCell`, no la reimplementa). */
function ariaLabelFor(b: ReservaListRow): string {
  const isBlock = b.type === 'block'
  const name = isBlock ? 'Bloqueo' : (b.playerName ?? b.guestName ?? 'Sin nombre')
  const ended = reservaHasEnded(b, Date.now())
  const live = reservaIsLive(b, Date.now())
  const timeRange = `${b.timeStart.slice(0, 5)}–${b.timeEnd.slice(0, 5)}`
  const moneyCell = agendaMoneyCell(b, ended)
  return [`Turno ${timeRange}`, b.courtName, name, live ? 'se juega' : null, moneyCell.text]
    .filter(Boolean)
    .join(', ')
}

// Por jugar, sin nada cobrado: la plata muestra el precio entero, gris.
const ROW_POR_JUGAR = row()
// Por jugar con una seña ya paga: "Falta $X" en gris, no el precio entero.
const ROW_POR_JUGAR_CON_SENA = row({
  id: uid(1003),
  depositAmount: 450_000,
  depositStatus: 'paid',
  pending: 1_050_000,
  totalPaid: 450_000,
})
// Se está jugando ahora mismo: punto verde "Se juega".
const ROW_EN_JUEGO = row({
  id: uid(1013),
  startsAt: new Date(Date.now() - 15 * 60_000).toISOString(),
  endsAt: new Date(Date.now() + 45 * 60_000).toISOString(),
})
const ROW_PAGADO = row({
  id: uid(1005),
  pending: 0,
  totalPaid: 1_500_000,
})
// Jugado y nada cobrado: rojo, "No cobrado · $X".
const ROW_JUGADO_SIN_COBRAR = row({
  id: uid(1015),
  status: 'completed',
  timeStart: '13:00',
  timeEnd: '14:00',
  pending: 1_500_000,
  totalPaid: 0,
})
// Jugado con cobro parcial: rojo, "Falta $X" (no repite "No cobrado" sobre plata que sí entró).
const ROW_JUGADO_PARCIAL = row({
  id: uid(1016),
  status: 'completed',
  timeStart: '13:00',
  timeEnd: '14:00',
  pending: 500_000,
  totalPaid: 1_000_000,
})
const ROW_ESPERANDO_SENA = row({
  id: uid(1004),
  status: 'pending_payment',
  depositStatus: 'pending',
  timeStart: '10:00',
  timeEnd: '11:00',
})
// Ausente sin cobrar: gris, NUNCA rojo (veto "No-show NO es deuda") aunque `pending` venga > 0.
const ROW_AUSENTE = row({
  id: uid(1006),
  status: 'no_show',
  timeStart: '20:00',
  timeEnd: '21:00',
  pending: 1_500_000,
  totalPaid: 0,
})
const ROW_CANCELADA = row({
  id: uid(1007),
  status: 'canceled_refunded',
  timeStart: '18:00',
  timeEnd: '19:00',
  pending: 1_500_000,
  totalPaid: 0,
})
const ROW_EXPIRADA = row({
  id: uid(1008),
  status: 'expired',
  timeStart: '21:00',
  timeEnd: '22:00',
  pending: 1_500_000,
  totalPaid: 0,
})
const ROW_BLOQUEO = row({
  id: uid(1011),
  type: 'block',
  playerName: null,
  guestName: null,
  phone: null,
  priceSnapshot: 0,
  depositAmount: 0,
  depositStatus: 'not_required',
  timeStart: '09:00',
  timeEnd: '10:00',
})
const ROW_FIJO = row({
  id: uid(1012),
  type: 'fixed',
  playerName: 'Rodrigo Fernández',
  timeStart: '20:00',
  timeEnd: '21:00',
})
// Evento de 3h desde la Grilla (excepción del staff, `assertWholeHours`): dura
// más de un turno (60 min), así que el chip lo dice.
const ROW_EVENTO = row({
  id: uid(1014),
  guestName: 'Cumple de Tobías',
  playerName: null,
  timeStart: '18:00',
  timeEnd: '21:00',
  priceSnapshot: 15_000_000,
})
const ROW_INVITADO = row({
  id: uid(1009),
  playerName: null,
  guestName: 'Fernando Bianchi',
  timeStart: '13:00',
  timeEnd: '14:00',
})
/** Caso límite: ni jugador registrado ni guest cargado. */
const ROW_SIN_NOMBRE = row({
  id: uid(1017),
  playerName: null,
  guestName: null,
  phone: null,
  timeStart: '08:00',
  timeEnd: '09:00',
})
/** Nombre de guest + cancha largos reales, para ejercitar truncate/overflow. */
const ROW_TEXTOS_LARGOS = row({
  id: uid(1010),
  playerName: null,
  guestName: 'Sebastián Maximiliano Villalba Etcheverry',
  courtName: 'Cancha 3 - Fútbol 11 (aire libre, césped natural)',
  priceSnapshot: 1_800_000,
  timeStart: '22:00',
  timeEnd: '23:00',
})

/**
 * Fila de la Agenda (`/reservas`). `(list)/page.tsx` la renderiza SIEMPRE
 * dentro de un `<ul>`: sin ese wrapper el `<li>` propio del componente queda
 * huérfano y axe marca `listitem`.
 */
const meta = {
  title: 'Admin/Reservas/BookingListItem',
  component: BookingListItem,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas' } },
  },
  decorators: [
    (Story) => (
      <ul className="max-w-3xl divide-y divide-border">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof BookingListItem>

export default meta
type Story = StoryObj<typeof meta>

export const PorJugar: Story = {
  args: { booking: ROW_POR_JUGAR },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_POR_JUGAR) }),
    ).toBeInTheDocument()
    // Dos copias en el DOM (renglón angosto + ancho, una oculta por CSS —
    // `getByText` no filtra por visibilidad): `getAllByText`.
    await expect(canvas.getAllByText(money(ROW_POR_JUGAR.priceSnapshot)).at(-1)!).toBeVisible()
  },
}

export const PorJugarConSena: Story = {
  args: { booking: ROW_POR_JUGAR_CON_SENA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(`Falta ${money(1_050_000)}`).at(-1)!).toBeVisible()
    // Control negativo: con una seña ya paga no repite el precio entero.
    await expect(canvas.queryAllByText(money(ROW_POR_JUGAR_CON_SENA.priceSnapshot))).toHaveLength(0)
  },
}

export const EnJuego: Story = {
  args: { booking: ROW_EN_JUEGO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Se juega').at(-1)!).toBeVisible()
  },
}

export const Pagado: Story = {
  args: { booking: ROW_PAGADO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Pagado').at(-1)!).toBeVisible()
  },
}

export const JugadoSinCobrar: Story = {
  args: { booking: ROW_JUGADO_SIN_COBRAR },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(`No cobrado · ${money(1_500_000)}`).at(-1)!).toBeVisible()
  },
}

export const JugadoParcial: Story = {
  args: { booking: ROW_JUGADO_PARCIAL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(`Falta ${money(500_000)}`).at(-1)!).toBeVisible()
    // Control negativo: no repite "No cobrado" sobre plata que sí entró.
    await expect(canvas.queryByText(/No cobrado/)).toBeNull()
  },
}

export const EsperandoSena: Story = {
  args: { booking: ROW_ESPERANDO_SENA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Esperando seña').at(-1)!).toBeVisible()
  },
}

export const Ausente: Story = {
  args: { booking: ROW_AUSENTE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Ausente').at(-1)!).toBeVisible()
    // Control negativo: veto "No-show NO es deuda" — nunca "No cobrado"/"Falta $X"
    // aunque `pending` venga > 0.
    await expect(canvas.queryByText(/No cobrado|Falta/)).toBeNull()
  },
}

export const Cancelada: Story = {
  args: { booking: ROW_CANCELADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Cancelada').at(-1)!).toBeVisible()
    await expect(canvas.queryByText(/Falta/)).toBeNull()
  },
}

export const Expirada: Story = {
  args: { booking: ROW_EXPIRADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Expirada').at(-1)!).toBeVisible()
  },
}

export const Bloqueo: Story = {
  args: { booking: ROW_BLOQUEO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Bloqueo').at(-1)!).toBeVisible()
    // Un bloqueo no habla de plata: ni "Sin cargo" ni un monto.
    await expect(canvas.queryByText('Sin cargo')).toBeNull()
    await expect(canvas.queryByText(/\$/)).toBeNull()
  },
}

/** Turno fijo de abonado: chip neutro "Fijo". */
export const Fijo: Story = {
  args: { booking: ROW_FIJO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Fijo').at(-1)!).toBeVisible()
  },
}

/** Evento de más de 60 min cargado desde la Grilla: "Evento · N h". */
export const Evento: Story = {
  args: { booking: ROW_EVENTO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Evento · 3 h').at(-1)!).toBeVisible()
  },
}

export const Invitado: Story = {
  args: { booking: ROW_INVITADO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Fernando Bianchi').at(-1)!).toBeVisible()
  },
}

/** Caso límite: ni jugador registrado ni guest cargado, cae al fallback "Sin nombre". */
export const SinNombre: Story = {
  args: { booking: ROW_SIN_NOMBRE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Sin nombre').at(-1)!).toBeVisible()
  },
}

/** Nombre de guest + cancha largos reales: el texto completo vive en el DOM (el truncate es solo visual, vía CSS) y en el aria-label. */
export const NombreYCanchaLargos: Story = {
  args: { booking: ROW_TEXTOS_LARGOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Dos copias en el DOM (renglón angosto + ancho, una oculta por CSS —
    // `getByText` no filtra por visibilidad): `getAllByText`.
    await expect(canvas.getAllByText(ROW_TEXTOS_LARGOS.guestName!)[0]).toBeInTheDocument()
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_TEXTOS_LARGOS) }),
    ).toBeInTheDocument()
  },
}
