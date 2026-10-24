import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { minutesFromNow } from '@/test/fixtures/clock'
import PaymentStatusWatcher, { PaymentStatusView } from './PaymentStatusWatcher'

const bookingId = 'b1a2c3d4-0001-4000-8000-000000000001'

const turn = {
  startsOn: '2026-03-14',
  timeStart: '21:00:00',
  timeEnd: '22:00:00',
  courtName: 'Cancha 2',
  tenantName: 'Complejo Fénix',
}
const whatsapp = { channel: 'whatsapp', href: '/whatsapp-de-la-story' } as const

/**
 * Vive en `reserva/[bookingId]/pendiente/page.tsx` (y en `/exito`, cuando el jugador vuelve de MP
 * antes de que llegue el webhook), sobre el cascarón de La Previa. Sin
 * cuenta regresiva: todo el que llega ya pasó por MercadoPago.
 *
 * `Confirmando` y las dos de `confirmado` corren el watcher de verdad (polling a los 3 s contra un
 * `fetchMock`). Los estados terminales cortan los `useEffect` en la primera línea, así que
 * tampoco agendan nada. La nota de los 30 s y el corte por red caída (~75 s de backoff) no se
 * pueden esperar en un `play`: esas stories muestran `PaymentStatusView`, la misma vista con el
 * estado ya puesto.
 */
const meta = {
  title: 'Player/BookingSuccess/PaymentStatusWatcher',
  component: PaymentStatusWatcher,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: `/reserva/${bookingId}/pendiente` } },
    fetchMock: [
      {
        match: `/api/player/bookings/${bookingId}/status`,
        json: {
          data: {
            status: 'pending_payment',
            depositStatus: 'pending',
            expiresAt: minutesFromNow(6).toISOString(),
          },
        },
      },
    ],
  },
  args: {
    bookingId,
    initialStatus: 'pending_payment',
    expiresAt: minutesFromNow(6).toISOString(),
    tenantSlug: 'complejo-fenix',
    date: '2026-03-14',
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PaymentStatusWatcher>

export default meta
type Story = StoryObj<typeof meta>

/** Default: pending_payment. "Confirmando…" sin cuenta regresiva ni nota de demora todavía. */
export const Confirmando: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeInTheDocument()
    await expect(canvas.getByText('Esto puede tardar unos segundos.')).toBeInTheDocument()
    await expect(canvas.queryByText(/te queda/i)).not.toBeInTheDocument()
    await expect(canvasElement.textContent).not.toMatch(/\d:\d\d/)
    await expect(canvas.queryByText(/¿Tarda\?/)).not.toBeInTheDocument()
  },
}

/** Pasados 30 s sin novedades suma la nota: el email llega si se confirma, y se ve en Mis reservas. */
export const NotaDeDemora: StoryObj<typeof PaymentStatusView> = {
  render: () => (
    <PaymentStatusView
      status="pending_payment"
      stalled={null}
      showDelayNote
      tenantSlug="complejo-fenix"
      date="2026-03-14"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Esto puede tardar unos segundos.')).toBeInTheDocument()
    await expect(
      canvas.getByText(
        '¿Tarda? Si se confirma, te llega un email. También lo ves en Mis reservas.',
      ),
    ).toBeInTheDocument()
  },
}

/**
 * Llega el webhook mientras mira la espera: el watcher navega a /exito con `replace` (sin una
 * pantalla intermedia propia). Dura lo que el primer poll: 3 s.
 */
export const ConfirmadoNavega: Story = {
  parameters: {
    fetchMock: [
      {
        match: `/api/player/bookings/${bookingId}/status`,
        json: {
          data: {
            status: 'confirmed',
            depositStatus: 'paid',
            expiresAt: minutesFromNow(6).toISOString(),
          },
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    getRouter().replace.mockClear()
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(`/reserva/${bookingId}/exito`),
    )
    // Mientras navega sigue la espera: no aparece un "¡Reserva confirmada!" propio.
    await expect(canvas.queryByText('¡Reserva confirmada!')).not.toBeInTheDocument()
  },
}

/** Ya en /exito (la page monta el watcher si la reserva todavía no estaba confirmada): relee la página. */
export const ConfirmadoEnExito: Story = {
  parameters: {
    ...ConfirmadoNavega.parameters,
    nextjs: { appDirectory: true, navigation: { pathname: `/reserva/${bookingId}/exito` } },
  },
  play: async () => {
    getRouter().refresh.mockClear()
    getRouter().replace.mockClear()
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalledTimes(1))
    await expect(getRouter().replace).not.toHaveBeenCalled()
  },
}

/** `expired`: el turno se liberó; "Reservar de nuevo" abre la ficha del complejo en ese día. */
export const Expirada: Story = {
  name: 'expired — el turno quedó liberado',
  args: { initialStatus: 'expired', contact: whatsapp },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'La reserva expiró' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute(
      'href',
      '/complejo-fenix?date=2026-03-14',
    )
    await expect(canvas.getByRole('link', { name: 'Escribirle al complejo' })).toHaveAttribute(
      'href',
      whatsapp.href,
    )
  },
}

/** canceled_refunded y canceled_no_refund renderizan el mismo bloque. */
export const Cancelada: Story = {
  args: { initialStatus: 'canceled_refunded' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Reserva cancelada' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

/** `completed` y `no_show`: ya se jugó, no hay nada que confirmar (antes caían en el spinner). */
export const YaPaso: Story = {
  args: { initialStatus: 'completed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Esta reserva ya pasó' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument()
    await expect(canvas.queryByText('Confirmando tu pago…')).not.toBeInTheDocument()
  },
}

export const TiempoAgotado: Story = {
  name: 'stalled=expired — expiresAt ya venció, sin transición terminal',
  args: { expiresAt: minutesFromNow(-10).toISOString() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Se acabó el tiempo')).toBeInTheDocument())
    // No promete mail ni reembolso: dice dónde mirar y a quién escribir.
    await expect(canvas.getByText(/En Mis reservas ves si el turno quedó confirmado/)).toBeVisible()
    await expect(canvas.getByText(/escribile al complejo/)).toBeVisible()
    await expect(canvasElement.textContent).not.toMatch(/email|te avisamos|acredite/i)
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument()
  },
}

/** Sin conexión: el polling falló 5 veces (~75 s de backoff). Rojo, porque es un error. */
export const SinConexion: StoryObj<typeof PaymentStatusView> = {
  render: () => (
    <PaymentStatusView
      status="pending_payment"
      stalled="error"
      showDelayNote
      tenantSlug="complejo-fenix"
      date="2026-03-14"
      contact={{ channel: 'tel', href: 'tel:+541145550000' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'No pudimos verificar tu pago' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Llamar al complejo' })).toHaveAttribute(
      'href',
      'tel:+541145550000',
    )
    await expect(canvas.getByText(/escribile al complejo/)).toBeVisible()
    await expect(canvasElement.textContent).not.toMatch(/email|te avisamos|acredite/i)
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument()
  },
}

/**
 * Cortó el pago sin pagar (cerró MercadoPago, volvió atrás): sigue el "Confirmando…" (puede haber
 * pagado y el webhook no llegó), pero con el turno a la vista y "Pagar la seña" hasta la hora límite.
 */
export const ConPagoAbierto: Story = {
  name: 'pending_payment — cortó el pago, puede pagar la seña',
  args: {
    turn,
    pay: {
      until: '20:14',
      deadline: minutesFromNow(4).toISOString(),
      action: fn(async () => undefined),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeInTheDocument()
    await expect(canvas.getByText(/^Sábado, 14 de marzo ·/).closest('p')).toHaveTextContent(
      'Sábado, 14 de marzo · 21:00 a 22:00 Cancha 2 · Complejo Fénix',
    )
    await expect(
      canvas.getByText('¿No llegaste a pagar? Podés pagar hasta las 20:14.'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Pagar la seña' }))
    await waitFor(() => expect(args.pay?.action).toHaveBeenCalledTimes(1))
  },
}

/** Pasada la hora límite (o MP caído, o un pago en proceso: `pay=null`), el botón no se ofrece. */
export const ConPagoVencido: Story = {
  name: 'pending_payment — ya no hay margen para pagar',
  args: {
    turn,
    pay: {
      until: '20:14',
      deadline: minutesFromNow(-1).toISOString(),
      action: fn(async () => undefined),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeInTheDocument()
    await waitFor(() =>
      expect(canvas.queryByRole('button', { name: 'Pagar la seña' })).not.toBeInTheDocument(),
    )
    await expect(canvas.queryByText(/¿No llegaste a pagar\?/)).not.toBeInTheDocument()
  },
}
