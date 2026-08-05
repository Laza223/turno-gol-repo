import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { artDateString } from '@/test/fixtures/clock'
import type { ReservaDetail } from '../queries'
import { BookingDetailCard } from './BookingDetailCard'

/**
 * Esta story existe porque su ausencia dejó pasar un bug real.
 *
 * `BookingDetailCard` se extrajo de `[id]/page.tsx` pero nunca se le escribió story ni
 * entró al inventario. El componente tenía dos `<dt>`/`<dd>` (nota del jugador, motivo
 * de cancelación) COLGANDO FUERA del `<dl>` — HTML inválido y violación de la regla
 * `dlitem` de axe. La misma regla ya había cazado el mismo error en MetricsDashboard;
 * acá pasó desapercibido porque no había nada que mirara este archivo.
 */
const detail = (overrides: Partial<ReservaDetail> = {}): ReservaDetail => ({
  id: uid(901),
  date: artDateString(),
  timeStart: '19:00',
  timeEnd: '20:00',
  status: 'confirmed',
  type: 'spontaneous',
  courtName: 'Cancha 1',
  playerName: 'Julián Álvarez',
  guestName: null,
  priceSnapshot: 18_000_00,
  depositAmount: 5_400_00,
  depositStatus: 'paid',
  paymentMethod: 'mercadopago',
  notesPlayer: null,
  notesInternal: null,
  playerPhone: '+54 11 2345-6789',
  guestPhone: null,
  canceledReason: null,
  cancellationPolicyHours: 12,
  abonadoId: null,
  ...overrides,
})

const meta = {
  title: 'Admin/Reservas/BookingDetailCard',
  component: BookingDetailCard,
  parameters: { layout: 'padded' },
  decorators: [
    // `[id]/page.tsx` lo renderiza bajo un <h1> "Detalle de la reserva", dentro de un
    // contenedor con ancho máximo. El componente ya trae su propia superficie
    // (.card-premium), así que el contenedor solo aporta el ancho y la jerarquía de
    // headings — que importa: sin el <h1>, axe marcaría heading-order.
    (Story) => (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Detalle de la reserva</h1>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingDetailCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El caso que hasta ahora se contradecía a sí mismo: el badge decía "Jugada"
 * en verde arriba y "Saldo pendiente: $X" aparecía en la sección de Cobros más
 * abajo, en la misma pantalla. Ahora la píldora "Sin cobrar" convive con el
 * badge de estado en vez de reemplazarlo.
 */
export const JugadaSinCobrar: Story = {
  args: {
    booking: detail({
      status: 'completed',
      depositStatus: 'not_required',
      depositAmount: 0,
      paymentMethod: null,
      pending: 18_000_00,
      totalPaid: 0,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugada')).toBeVisible()
    await expect(canvas.getByText('Sin cobrar')).toBeVisible()
  },
}

/** Jugada y cobrada: sin píldora. El control negativo del caso de arriba. */
export const JugadaCobrada: Story = {
  args: {
    booking: detail({
      status: 'completed',
      depositStatus: 'captured',
      pending: 0,
      totalPaid: 18_000_00,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugada')).toBeVisible()
    await expect(canvas.queryByText('Sin cobrar')).toBeNull()
  },
}

export const Confirmada: Story = {
  args: { booking: detail() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Julián Álvarez')).toBeVisible()
    await expect(canvas.getByText('Confirmada')).toBeVisible()
  },
}

/** Reserva de invitado: sin jugador registrado, se muestran nombre y teléfono del guest. */
export const Invitado: Story = {
  args: {
    booking: detail({
      playerName: null,
      playerPhone: null,
      guestName: 'Rodrigo Fernández',
      guestPhone: '+54 11 5555-1234',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Rodrigo Fernández')).toBeVisible()
  },
}

/** Sin seña: el campo dice "Sin seña" en vez de un monto. */
export const SinSena: Story = {
  args: { booking: detail({ depositAmount: 0, depositStatus: 'not_required', paymentMethod: null }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin seña')).toBeVisible()
  },
}

/**
 * Nota del jugador presente: es el bloque que colgaba FUERA del `<dl>`.
 * Esta story es la que hace fallar el bug si alguien lo reintroduce.
 */
export const ConNotaDelJugador: Story = {
  args: {
    booking: detail({
      notesPlayer: 'Somos 10, llevamos pecheras propias. Si se puede, dejar la cancha del fondo.',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nota del jugador')).toBeVisible()
    await expect(canvas.getByText(/pecheras propias/)).toBeVisible()
  },
}

/** Cancelada con reembolso: aparece el motivo, el otro bloque que estaba fuera del `<dl>`. */
export const CanceladaConMotivo: Story = {
  args: {
    booking: detail({
      status: 'canceled_refunded',
      depositStatus: 'refunded',
      canceledReason: 'El complejo canceló por mantenimiento de la cancha.',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Motivo de cancelación')).toBeVisible()
    await expect(canvas.getByText(/mantenimiento/)).toBeVisible()
  },
}

/** Ausente con seña capturada + nota y motivo a la vez: los DOS bloques del `<dl>` juntos. */
export const AusenteConTodo: Story = {
  args: {
    booking: detail({
      status: 'no_show',
      depositStatus: 'captured',
      notesPlayer: 'Reservo para el equipo de siempre.',
      canceledReason: 'No se presentaron. Seña capturada.',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nota del jugador')).toBeVisible()
    await expect(canvas.getByText('Motivo de cancelación')).toBeVisible()
  },
}

/** Texto largo en la nota: no debe desbordar la card ni romper el grid de 2 columnas. */
export const NotaMuyLarga: Story = {
  args: {
    booking: detail({
      playerName: 'María Fernanda Etcheverry Balcarce',
      notesPlayer:
        'Necesitamos la cancha con las luces prendidas desde las 19 porque a esa hora ya no se ve nada, y si se puede dejar libre el vestuario grande sería ideal porque venimos con dos equipos completos y no entramos en el chico. Avisar si hay que pagar algo extra.',
    }),
  },
}
