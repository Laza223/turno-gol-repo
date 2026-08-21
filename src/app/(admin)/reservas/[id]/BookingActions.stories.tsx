import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { expectGone } from '@/test/expect-gone'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { artDateString, daysFromNow, hoursFromNow } from '@/test/fixtures/clock'
import { uid } from '@/test/fixtures/ids'
import type { BookingActionResult, CompleteAndChargeResult } from '../actions'
import BookingActions from './BookingActions'

const BOOKING_ID = uid(1001)

// Reloj congelado del preview: sáb 14-mar-2026, 15:30 ART (ver .storybook/preview.tsx).
// Turno hoy 20:00 con política de 12hs → la ventana de reembolso (11:00) ya pasó:
// "fuera de plazo". Turno en 2 días 20:00 → la ventana (11:00 del 16) todavía no llegó:
// "dentro de plazo". Mismo cálculo que bookingStartMs() en BookingActions.tsx.
const TODAY_EVENING = artDateString(daysFromNow(0))
const IN_TWO_DAYS_EVENING = artDateString(daysFromNow(2))

const okResult: BookingActionResult = { success: true, booking: {} as never }

const meta = {
  title: 'Admin/Reservas/BookingActions',
  component: BookingActions,
  parameters: { layout: 'padded' },
  args: {
    bookingId: BOOKING_ID,
    status: 'confirmed',
    depositStatus: 'paid',
    depositAmount: 450_000,
    paymentMethod: 'mercadopago',
    bookingDate: TODAY_EVENING,
    timeStart: '20:00:00',
    cancellationPolicyHours: 12,
    priceSnapshot: 1500000,
    chargesTotal: 0,
    guestName: null,
    guestPhone: null,
    completeAndChargeBookingAction: fn(async (): Promise<CompleteAndChargeResult> => okResult),
    markNoShowAction: fn(async (): Promise<BookingActionResult> => okResult),
    revertNoShowAction: fn(async (): Promise<BookingActionResult> => okResult),
    cancelBookingAction: fn(async (): Promise<BookingActionResult> => okResult),
  },
  decorators: [
    // Mismo contenedor que `[id]/page.tsx`: BookingActions vive debajo de
    // BookingDetailCard/BookingCharges, bajo el <h1> "Detalle de la reserva"
    // (ver el decorator homólogo en BookingDetailCard.stories.tsx).
    (Story) => (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Detalle de la reserva</h1>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingActions>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Reserva confirmada de HOY a las 20:00 (reloj congelado en 15:30, ver
 * arriba): las 3 acciones están visibles, pero MEJORA-UX QA — "Marcar
 * completada"/"Marcar ausente" no tienen sentido antes de que el turno
 * termine, así que arrancan deshabilitadas con el porqué en `title`.
 * "Cancelar" es la excepción: cancelar un turno que todavía no pasó es
 * exactamente el caso de uso normal.
 */
export const Confirmada: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const completar = canvas.getByRole('button', { name: 'Marcar completada' })
    const ausente = canvas.getByRole('button', { name: 'Marcar ausente' })
    await expect(completar).toBeVisible()
    await expect(completar).toBeDisabled()
    await expect(completar).toHaveAttribute('title', 'El turno todavía no terminó')
    await expect(ausente).toBeVisible()
    await expect(ausente).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
  },
}

/**
 * Regla de negocio: el componente entero es `null` fuera de `status === 'confirmed'`,
 * con DOS excepciones (abajo), las dos correcciones de asistencia de 24h: un
 * `no_show` que se deshace y un `completed` que se corrige a ausente. Una
 * reserva cancelada no ofrece NINGUNA acción.
 */
export const SinAccionesSiNoEstaConfirmada: Story = {
  args: { status: 'canceled_refunded' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/**
 * P5 — corrección de asistencia: el cron `auto-complete-bookings` pasa el turno
 * a "Jugada" hasta 30 minutos después de que termina. Si el equipo no vino,
 * ESTE es el único lugar donde se puede corregir, y por eso tiene que existir:
 * el motor lo soportaba desde siempre pero no había puerta, así que la ventana
 * real para registrar una ausencia eran esos ≤30 minutos.
 */
export const CompletadaDentroDeLa24hSePuedeCorregirAAusente: Story = {
  args: {
    status: 'completed',
    depositStatus: 'paid',
    updatedAt: hoursFromNow(-3).toISOString(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar ausente' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await waitFor(() => expect(dialog.getByText(/figura como jugado/i)).toBeVisible())
    await userEvent.click(dialog.getByRole('button', { name: 'Marcar ausente' }))

    await waitFor(() => expect(args.markNoShowAction).toHaveBeenCalledWith(BOOKING_ID))
    await expectGone(dialogEl)
    const toastText = await body.findByText('Marcada como ausente')
    await expect(toastText).toBeVisible()
    // Mismo motivo que en la story de deshacer: el toast sobrevive al cambio de
    // story y la siguiente asertea CERO botones.
    await userEvent.click(body.getByRole('button', { name: 'Cerrar' }))
    await expectGone(() => body.queryByText('Marcada como ausente'))
  },
}

/** Pasadas las 24h de la marca de jugado, el turno es inmutable. */
export const CompletadaPasadasLas24hNoOfreceNada: Story = {
  args: {
    status: 'completed',
    updatedAt: hoursFromNow(-25).toISOString(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/**
 * RI #1 — corrección inversa: turno marcado ausente hace 2hs. Se ofrece
 * "Deshacer ausente" y el diálogo avisa que la seña capturada NO vuelve sola.
 */
export const AusenteDentroDeLa24hSePuedeDeshacer: Story = {
  args: {
    status: 'no_show',
    depositStatus: 'captured',
    // Relativo al reloj congelado del preview (NO `Date.now()` en el módulo:
    // los args se evalúan fuera del render y quedarían desfasados).
    updatedAt: hoursFromNow(-2).toISOString(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Deshacer ausente' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    // Radix puede seguir animando la entrada (mismo gotcha que MarcarAusenteConfirmado).
    await waitFor(() => expect(dialog.getByText(/no se devuelve sola/i)).toBeVisible())
    await userEvent.click(dialog.getByRole('button', { name: 'Deshacer ausente' }))

    await waitFor(() => expect(args.revertNoShowAction).toHaveBeenCalledWith(BOOKING_ID))
    await expectGone(dialogEl)
    const toastText = await body.findByText('Ausencia deshecha')
    await expect(toastText).toBeVisible()
    await expect(getRouter().refresh).toHaveBeenCalled()
    // El toast (variant success, 4s de duración) sobrevive al cambio de story:
    // cerrarlo acá evita que "Ausente Pasadas Las 24h No Ofrece Nada" (que
    // asertea CERO botones) lo agarre a mitad de la animación de salida.
    await userEvent.click(body.getByRole('button', { name: 'Cerrar' }))
    await expectGone(() => body.queryByText('Ausencia deshecha'))
  },
}

/** Pasadas las 24h el turno es inmutable: ni siquiera se ofrece deshacer. */
export const AusentePasadasLas24hNoOfreceNada: Story = {
  args: {
    status: 'no_show',
    updatedAt: hoursFromNow(-25).toISOString(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/**
 * "Marcar completada" NUNCA llama una action directa: abre CompleteBookingDialog
 * (Completar + Cobrar). `completeBookingAction` quedó muerto tras el rediseño
 * (mismo criterio que QuickActions.stories.tsx → CompletarAbreElDialogoDeCobro).
 */
export const MarcarCompletadaAbreElDialogoDeCobro: Story = {
  // MEJORA-UX QA: "Marcar completada" se deshabilita antes de que el turno
  // termine (mismo criterio que "Marcar ausente" y que `chargeMode` en la
  // grilla) — sin `endsAt` en el pasado, el default (hoy 20:00, reloj
  // congelado en 15:30) lo dejaría deshabilitado y el click no abriría nada.
  args: { endsAt: hoursFromNow(-1).toISOString() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar completada' }))
    const body = within(document.body)
    await expect(await body.findByRole('heading', { name: 'Completar turno' })).toBeInTheDocument()
  },
}

/** "Marcar ausente" abre confirmación (menciona la política de softban) antes de ejecutar. */
export const MarcarAusenteConfirmado: Story = {
  // Mismo motivo que MarcarCompletadaAbreElDialogoDeCobro: gate de "turno ya
  // terminado" nuevo en el botón de entrada.
  args: { endsAt: hoursFromNow(-1).toISOString() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar ausente' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    // El diálogo recién abre: la animación de entrada de Radix puede seguir en
    // curso (mismo gotcha que RegisterMovementModal.stories.tsx / CanteenQuickSale.stories.tsx).
    await waitFor(() => expect(dialog.getByText(/segunda ausencia en 90 días/)).toBeVisible())
    await expect(dialog.getByText(/bloqueado 14 días/)).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Marcar ausente' }))

    await waitFor(() => expect(args.markNoShowAction).toHaveBeenCalledWith(BOOKING_ID))
    await expectGone(dialogEl)
    await expect(await body.findByText('Marcada como ausente')).toBeVisible()
    await expect(getRouter().refresh).toHaveBeenCalled()
  },
}

/** Cancela el complejo: reembolso automático de la seña vía MercadoPago, sin importar la ventana horaria. */
export const CancelarComplejoReembolsoAutomatico: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await userEvent.click(dialog.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    // Mismo gotcha: el diálogo (y el bloque de preview recién insertado) puede
    // seguir en su animación de entrada.
    await waitFor(() =>
      expect(dialog.getByText('Se reembolsará la seña de $ 4.500 vía MercadoPago.')).toBeVisible(),
    )
    await userEvent.type(dialog.getByLabelText('Motivo (obligatorio)'), 'Cancha en mantenimiento')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() =>
      expect(args.cancelBookingAction).toHaveBeenCalledWith(
        BOOKING_ID,
        'Cancha en mantenimiento',
        'complejo',
      ),
    )
    await expectGone(dialogEl)
    await expect(await body.findByText('Reserva cancelada')).toBeVisible()
  },
}

/** Cancela el jugador fuera de la ventana de la política: el complejo retiene la seña. */
export const CancelarJugadorFueraDePlazoSinReembolso: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await userEvent.click(dialog.getByRole('radio', { name: /El jugador pidió cancelar/i }))
    await waitFor(() =>
      expect(
        dialog.getByText(
          'Fuera del plazo de cancelación (12h): la seña de $ 4.500 queda para el complejo (sin reembolso).',
        ),
      ).toBeVisible(),
    )
    await userEvent.type(dialog.getByLabelText('Motivo (obligatorio)'), 'Avisó una hora antes')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() =>
      expect(args.cancelBookingAction).toHaveBeenCalledWith(
        BOOKING_ID,
        'Avisó una hora antes',
        'jugador',
      ),
    )
  },
}

/** Jugador dentro de plazo pero seña pagada en efectivo: el reembolso corresponde, pero no es automático. */
export const CancelarJugadorDentroDePlazoPagoEnEfectivo: Story = {
  args: { bookingDate: IN_TWO_DAYS_EVENING, paymentMethod: 'cash' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('radio', { name: /El jugador pidió cancelar/i }))
    await waitFor(() =>
      expect(
        dialog.getByText(
          'Coordiná el reembolso de $ 4.500 en efectivo/transferencia con el jugador (no es automático).',
        ),
      ).toBeVisible(),
    )
  },
}

/** Sin elegir quién cancela y sin motivo: dos validaciones propias del cliente, ninguna llama al servidor. */
export const CancelarValidaMotivoYQuienCancela: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar reserva' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Indicá quién cancela la reserva.',
    )

    await userEvent.click(dialog.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar reserva' }))
    // El mismo <p role="alert"> se reutiliza entre intentos: esperar el texto
    // nuevo, no solo la presencia del rol (que ya estaba desde el intento anterior).
    await waitFor(() =>
      expect(dialog.getByRole('alert')).toHaveTextContent(
        'Ingresá un motivo (mínimo 3 caracteres).',
      ),
    )

    await expect(args.cancelBookingAction).not.toHaveBeenCalled()
  },
}

/** El servidor rechaza la cancelación (ej. la reserva ya no está confirmada): el diálogo queda abierto con el error. */
export const ErrorDelServidorAlCancelar: Story = {
  args: {
    cancelBookingAction: fn(async (): Promise<BookingActionResult> => ({
      success: false,
      error: 'La reserva no está en estado confirmado.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    await userEvent.type(dialog.getByLabelText('Motivo (obligatorio)'), 'Prueba de error')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar reserva' }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'La reserva no está en estado confirmado.',
    )

    // Lo que hay que probar es que el diálogo NO se cerró: el error es inline y el usuario
    // sigue pudiendo corregir y reintentar.
    //
    // Se asertea sobre CONTENIDO, no sobre el shell del diálogo. Un
    // `expect(await body.findByRole('dialog')).toBeVisible()` acá flakeaba ~1 de cada 3
    // corridas de la suite completa: `findByRole` engancha el nodo con `role="dialog"`
    // apenas monta —- todavía sin hijos y a mitad de la animación de entrada de Radix— y
    // `toBeVisible()` lo lee como oculto. Un botón adentro del diálogo solo existe si el
    // diálogo está montado Y renderizado, y no depende de en qué frame de la animación
    // caiga el assert.
    await expect(dialog.getByRole('button', { name: 'Cancelar reserva' })).toBeInTheDocument()
  },
}
