import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { formatArs } from '@/lib/format'
import { artDateString } from '@/test/fixtures/clock'
import { uid } from '@/test/fixtures/ids'
import type { ReservaListRow } from './queries'
import { BookingListItem } from './BookingListItem'
import { reservaStatusVisual } from './status-visual'

const SUCCESS = { success: true as const, booking: {} as never }

/**
 * `formatArs` (Intl.NumberFormat) mete un NBSP (U+00A0) entre "$" y el número.
 * El normalizer default de `getByText` colapsa `\s+` del texto del DOM (NBSP
 * incluido) a un espacio simple, pero NO normaliza el string que uno le pasa
 * como matcher — así que hay que normalizarlo acá también o nunca matchea.
 */
const money = (cents: number): string => formatArs(cents).replace(/\u00A0/g, ' ')

/**
 * Cierra el toast por su botón "Cerrar" y espera a que desaparezca del DOM del
 * todo: el `data-state=closed` no es instantáneo (use-toast.ts lo saca del store
 * recién a los 200ms reales, sin relación con `reducedMotion`), y si el scan de
 * axe (que corre DESPUÉS del `play`) lo agarra a mitad de esa transición, mide un
 * contraste falso. Mismo patrón que QuickActions.stories.tsx / CourtList.stories.tsx.
 */
async function closeToast(text: string): Promise<void> {
  const body = within(document.body)
  const matches = await body.findAllByText(text)
  const toastItem = matches
    .map((el) => el.closest('li'))
    .find((li): li is HTMLLIElement => li !== null)
  if (!toastItem) throw new Error(`No se encontró el toast: ${text}`)
  await userEvent.click(within(toastItem).getByRole('button', { name: 'Cerrar' }))
  await waitFor(() => expect(body.queryByText(text)).not.toBeInTheDocument())
}

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
  priceSnapshot: 1_500_000,
  depositAmount: 450_000,
  depositStatus: 'paid',
  paymentMethod: 'mercadopago',
  ...overrides,
})

/** Recalcula el aria-label esperado con la MISMA lógica que BookingListItem.tsx (reusa `reservaStatusVisual`, no la reimplementa). */
function ariaLabelFor(b: ReservaListRow): string {
  const isBlock = b.type === 'block'
  const name = isBlock ? 'Bloqueo' : (b.playerName ?? b.guestName ?? 'Sin nombre')
  const isAbonado = !isBlock && b.type === 'fixed'
  return [
    `Reserva ${b.timeStart}–${b.timeEnd}`,
    b.courtName,
    name,
    reservaStatusVisual(b).label,
    isAbonado ? 'abonado' : null,
  ]
    .filter(Boolean)
    .join(', ')
}

const ROW_CONFIRMADA = row()
const ROW_PENDIENTE = row({
  id: uid(1003),
  status: 'pending_payment',
  depositStatus: 'pending',
  paymentMethod: null,
  timeStart: '10:00',
  timeEnd: '11:00',
})
const ROW_JUGADA = row({
  id: uid(1005),
  status: 'completed',
  depositStatus: 'captured',
  timeStart: '11:00',
  timeEnd: '12:00',
})
const ROW_AUSENTE = row({
  id: uid(1006),
  status: 'no_show',
  depositStatus: 'captured',
  timeStart: '20:00',
  timeEnd: '21:00',
})
const ROW_CANCELADA_REEMBOLSADA = row({
  id: uid(1007),
  status: 'canceled_refunded',
  depositStatus: 'refunded',
  timeStart: '18:00',
  timeEnd: '19:00',
})
const ROW_CANCELADA_SIN_REEMBOLSO = row({
  id: uid(1008),
  status: 'canceled_no_refund',
  depositStatus: 'captured',
  timeStart: '17:00',
  timeEnd: '18:00',
})
const ROW_EXPIRADA = row({
  id: uid(1004),
  status: 'expired',
  depositStatus: 'pending',
  paymentMethod: null,
  timeStart: '21:00',
  timeEnd: '22:00',
})
const ROW_BLOQUEO = row({
  id: uid(1011),
  type: 'block',
  playerName: null,
  guestName: null,
  priceSnapshot: 0,
  depositAmount: 0,
  depositStatus: 'not_required',
  paymentMethod: null,
  timeStart: '09:00',
  timeEnd: '10:00',
})
const ROW_ABONADO = row({
  id: uid(1012),
  type: 'fixed',
  playerName: 'Rodrigo Fernández',
  depositAmount: 0,
  depositStatus: 'not_required',
  paymentMethod: 'cash',
  timeStart: '20:00',
  timeEnd: '21:00',
})
const ROW_INVITADO = row({
  id: uid(1009),
  playerName: null,
  guestName: 'Fernando Bianchi',
  depositAmount: 0,
  depositStatus: 'not_required',
  paymentMethod: 'cash',
  timeStart: '13:00',
  timeEnd: '14:00',
})
/** Caso límite: ni jugador registrado ni guest cargado. */
const ROW_SIN_NOMBRE = row({
  id: uid(1017),
  playerName: null,
  guestName: null,
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
  depositAmount: 540_000,
  timeStart: '22:00',
  timeEnd: '23:00',
})

/**
 * Fila de la lista de /reservas. `reservas/page.tsx` la renderiza SIEMPRE dentro
 * de un `<ul>`: sin ese wrapper el `<li>` propio del componente queda huérfano y
 * axe marca `listitem`.
 */
const meta = {
  title: 'Admin/Reservas/BookingListItem',
  component: BookingListItem,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas' } },
  },
  args: {
    actions: {
      cancelBookingAction: fn(async () => SUCCESS),
      completeBookingAction: fn(async () => SUCCESS),
      confirmDepositPaymentAction: fn(async () => SUCCESS),
      markNoShowAction: fn(async () => SUCCESS),
    },
  },
  decorators: [
    (Story) => (
      <ul className="max-w-2xl space-y-2">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof BookingListItem>

export default meta
type Story = StoryObj<typeof meta>

// ─── Un status por story ────────────────────────────────────────────────────

export const Confirmada: Story = {
  args: { booking: ROW_CONFIRMADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_CONFIRMADA) })
    ).toBeInTheDocument()
    await expect(canvas.getByText(money(ROW_CONFIRMADA.priceSnapshot))).toBeVisible()
    await expect(
      canvas.getByText(`Seña pagada (${money(ROW_CONFIRMADA.depositAmount)})`, { exact: false })
    ).toBeVisible()
    // pending_payment/confirmed: la fila ofrece acciones rápidas.
    await expect(canvas.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  },
}

export const PendientePago: Story = {
  args: { booking: ROW_PENDIENTE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Esperando seña')).toBeVisible()
    await expect(
      canvas.getByText(`Seña pendiente (${money(ROW_PENDIENTE.depositAmount)})`, { exact: false })
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Confirmar pago' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  },
}

export const Jugada: Story = {
  args: { booking: ROW_JUGADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugada')).toBeVisible()
    // Un turno ya jugado no ofrece acciones rápidas: no se puede reabrir.
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Completada' })).toBeNull()
  },
}

export const Ausente: Story = {
  args: { booking: ROW_AUSENTE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ausente')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Ausente' })).toBeNull()
  },
}

/** Una reserva ya cancelada no puede cancelarse de nuevo: sin acciones rápidas. */
export const CanceladaConReembolso: Story = {
  args: { booking: ROW_CANCELADA_REEMBOLSADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancelada')).toBeVisible()
    await expect(canvas.getByText('Seña reembolsada', { exact: false })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  },
}

export const CanceladaSinReembolso: Story = {
  args: { booking: ROW_CANCELADA_SIN_REEMBOLSO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancelada')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  },
}

export const Expirada: Story = {
  args: { booking: ROW_EXPIRADA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Expirada')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Confirmar pago' })).toBeNull()
  },
}

// ─── type: block / fixed ────────────────────────────────────────────────────

export const BloqueoAdministrativo: Story = {
  args: { booking: ROW_BLOQUEO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El aria-label ya prueba "Bloqueo" como nombre Y como estado (BLOCK_VISUAL.label
    // cubre las dos cosas): getByText('Bloqueo') sería ambiguo, aparece en el nombre
    // Y en el badge de estado a la vez.
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_BLOQUEO) })
    ).toBeInTheDocument()
    await expect(canvas.getAllByText('Bloqueo')).toHaveLength(2)
    // Sin importar el status, un bloqueo administrativo nunca ofrece acciones de reserva.
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Turno fijo de abonado: sigue ofreciendo acciones rápidas (no es un bloqueo). */
export const Abonado: Story = {
  args: { booking: ROW_ABONADO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Abonado')).toBeVisible()
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_ABONADO) })
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  },
}

// ─── Nombre del cliente: jugador registrado vs. invitado ───────────────────

export const Invitado: Story = {
  args: { booking: ROW_INVITADO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Fernando Bianchi')).toBeVisible()
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_INVITADO) })
    ).toBeInTheDocument()
  },
}

/** Caso límite: ni jugador registrado ni guest cargado, cae al fallback "Sin nombre". */
export const SinNombre: Story = {
  args: { booking: ROW_SIN_NOMBRE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin nombre')).toBeVisible()
  },
}

// ─── Overflow / vista compacta ──────────────────────────────────────────────

/** Nombre de guest + cancha largos reales: el texto completo vive en el DOM (el truncate es solo visual, vía CSS) y en el aria-label. */
export const NombreYCanchaLargos: Story = {
  args: { booking: ROW_TEXTOS_LARGOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(ROW_TEXTOS_LARGOS.guestName!)).toBeInTheDocument()
    await expect(
      canvas.getByRole('article', { name: ariaLabelFor(ROW_TEXTOS_LARGOS) })
    ).toBeInTheDocument()
  },
}

/** `?vista=compacta`: una línea por reserva, sin la línea secundaria de seña. */
export const VistaCompacta: Story = {
  args: { booking: ROW_CONFIRMADA, compact: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(money(ROW_CONFIRMADA.priceSnapshot))).toBeVisible()
    await expect(canvas.queryByText('Seña pagada', { exact: false })).toBeNull()
  },
}

// ─── `actions` se reenvía tal cual a QuickActions ──────────────────────────

/** Confirma que el prop `actions` (Server Component → Client Component) llega intacto hasta QuickActions. */
export const AccionRapidaCompletarSePropaga: Story = {
  args: { booking: ROW_CONFIRMADA },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Completada' }))
    await waitFor(() =>
      expect(args.actions.completeBookingAction).toHaveBeenCalledWith(ROW_CONFIRMADA.id)
    )
    await closeToast('Marcada como completada')
  },
}
