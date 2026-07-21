import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { formatArs } from '@/lib/format'
import { uid } from '@/test/fixtures/ids'
import type { BookingActionResult } from './actions'
import { QuickActions } from './QuickActions'

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
 * todo (no alcanza con clickear "Cerrar": eso solo dispara el `data-state=closed`,
 * y el fade-out —aunque `reducedMotion` lo achique a .01ms— igual tarda un tick
 * en desmontar). Si el scan de axe (que corre DESPUÉS del `play`, en `afterEach`)
 * agarra ese frame intermedio, mide un contraste falso a mitad de transición —
 * mismo patrón que documenta vitest.storybook.config.ts para las animaciones de
 * Radix. Sin este cleanup, el toast también sigue vivo cuando arranca la
 * SIGUIENTE story y puede hacerle exactamente el mismo lío.
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

const CONFIRMADA_SENA_MP = {
  id: uid(1002),
  status: 'confirmed',
  type: 'spontaneous',
  depositStatus: 'paid',
  depositAmount: 450_000,
  paymentMethod: 'mercadopago',
  priceSnapshot: 1500000,
  guestName: null,
  guestPhone: null,
}

const PENDIENTE_PAGO = {
  id: uid(1003),
  status: 'pending_payment',
  type: 'spontaneous',
  depositStatus: 'pending',
  depositAmount: 450_000,
  paymentMethod: null,
  priceSnapshot: 1500000,
  guestName: null,
  guestPhone: null,
}

/**
 * `QuickActions` vive dentro de la fila de `BookingListItem` (bg-card, `relative`,
 * `p-3`): el trigger mobile se posiciona `absolute` contra esa superficie, así que
 * el decorator la reproduce en vez de dejarlo suelto.
 *
 * Las 4 Server Actions entran por PROP (ver el comentario en QuickActions.tsx):
 * `./actions` es `'use server'` y arrastra `node:async_hooks`, que Vite
 * externaliza en el browser y rompe Storybook.
 */
const meta = {
  title: 'Admin/Reservas/QuickActions',
  component: QuickActions,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas' } },
  },
  args: {
    label: 'Julián Álvarez · 19:00–20:00',
    cancelBookingAction: fn(async () => SUCCESS),
    completeBookingAction: fn(async () => SUCCESS),
    completeAndChargeBookingAction: fn(async () => SUCCESS) as any,
    confirmDepositPaymentAction: fn(async () => SUCCESS),
    markNoShowAction: fn(async () => SUCCESS),
  },
  decorators: [
    (Story) => (
      <div className="relative max-w-xl rounded-xl border border-border bg-card p-3 shadow-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickActions>

export default meta
type Story = StoryObj<typeof meta>

// ─── Qué acciones ofrece el menú según el estado del booking ──────────────

export const AccionesConfirmada: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Completada' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Ausente' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Cancelar' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Confirmar pago' })).toBeNull()
  },
}

export const AccionesPendientePago: Story = {
  args: { booking: PENDIENTE_PAGO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Confirmar pago' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Completada' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Ausente' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  },
}

/** Una reserva ya cancelada no puede cancelarse de nuevo: hasQuickActions la excluye del todo. */
export const SinAccionesReservaCancelada: Story = {
  args: { booking: { ...CONFIRMADA_SENA_MP, id: uid(1007), status: 'canceled_refunded' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Completada' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Ausente' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Confirmar pago' })).toBeNull()
  },
}

/** Bloqueo administrativo: sin importar el status, un bloqueo nunca ofrece acciones de reserva. */
export const SinAccionesBloqueo: Story = {
  args: { booking: { ...CONFIRMADA_SENA_MP, id: uid(1011), type: 'block' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Completada' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  },
}

// ─── Flujo de cada acción ───────────────────────────────────────────────────

export const ConfirmarPagoLlamaLaAction: Story = {
  args: { booking: PENDIENTE_PAGO },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar pago' }))
    await waitFor(() =>
      expect(args.confirmDepositPaymentAction).toHaveBeenCalledWith(PENDIENTE_PAGO.id)
    )
    await closeToast('Pago confirmado')
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  },
}

export const CompletarLlamaLaAction: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Completada' }))
    await waitFor(() =>
      expect(args.completeBookingAction).toHaveBeenCalledWith(CONFIRMADA_SENA_MP.id)
    )
    await closeToast('Marcada como completada')
  },
}

/** "Ausente" pide un segundo click de confirmación inline (sin modal, con auto-desarme a los 4s). */
export const AusenteRequiereDobleClick: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ausente' }))
    await expect(canvas.getByRole('button', { name: '¿Confirmar ausente?' })).toBeVisible()
    await expect(args.markNoShowAction).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: '¿Confirmar ausente?' }))
    await waitFor(() => expect(args.markNoShowAction).toHaveBeenCalledWith(CONFIRMADA_SENA_MP.id))
    await closeToast('Marcada como ausente')
  },
}

/** Si la Server Action devuelve error, el toast es destructivo y NO se refresca el router. */
export const AccionFallidaMuestraError: Story = {
  args: {
    booking: CONFIRMADA_SENA_MP,
    completeBookingAction: fn(
      async (): Promise<BookingActionResult> => ({
        success: false,
        error: 'El turno todavía no terminó.',
      })
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Completada' }))
    await closeToast('El turno todavía no terminó.')
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  },
}

// ─── Cancelar: diálogo con motivo + preview del reembolso de la seña ──────

/** Sin elegir quién cancela ni motivo, el submit rebota con un error inline y no llama a la action. */
export const CancelarSinDatosMuestraError: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const body = within(document.body)
    await expect(await body.findByRole('heading', { name: 'Cancelar reserva' })).toBeInTheDocument()

    await userEvent.click(body.getByRole('button', { name: 'Cancelar reserva' }))
    await expect(await body.findByRole('alert')).toHaveTextContent(
      'Indicá quién cancela la reserva.'
    )
    await expect(args.cancelBookingAction).not.toHaveBeenCalled()
  },
}

/** Complejo cancela con seña pagada por MercadoPago: reembolso automático, flujo completo. */
export const CancelarPorElComplejoConSenaMercadoPago: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const body = within(document.body)
    await body.findByRole('heading', { name: 'Cancelar reserva' })

    await userEvent.click(body.getByRole('radio', { name: /El complejo necesita cancelar/ }))
    await waitFor(() =>
      expect(
        body.getByText(
          `Se reembolsará la seña de ${money(CONFIRMADA_SENA_MP.depositAmount)} vía MercadoPago.`
        )
      ).toBeVisible()
    )

    await userEvent.type(
      body.getByLabelText('Motivo (obligatorio)'),
      'Cancha rota, mantenimiento urgente.'
    )
    await userEvent.click(body.getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() =>
      expect(args.cancelBookingAction).toHaveBeenCalledWith(
        CONFIRMADA_SENA_MP.id,
        'Cancha rota, mantenimiento urgente.',
        'complejo'
      )
    )
    await waitFor(() =>
      expect(body.queryByRole('heading', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    )
    await closeToast('Reserva cancelada')
  },
}

/** Complejo cancela con seña pagada en efectivo: el reembolso NO es automático, hay que coordinarlo. */
export const CancelarPorElComplejoConSenaEnEfectivo: Story = {
  args: { booking: { ...CONFIRMADA_SENA_MP, id: uid(1014), paymentMethod: 'cash' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const body = within(document.body)
    await body.findByRole('heading', { name: 'Cancelar reserva' })
    await userEvent.click(body.getByRole('radio', { name: /El complejo necesita cancelar/ }))
    await waitFor(() =>
      expect(
        body.getByText(
          `Coordiná el reembolso de ${money(CONFIRMADA_SENA_MP.depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
        )
      ).toBeVisible()
    )
  },
}

/** El jugador pide cancelar con seña pagada: se aplica la política de cancelación del complejo. */
export const CancelarPorElJugadorConSenaPagada: Story = {
  args: { booking: { ...CONFIRMADA_SENA_MP, id: uid(1015) } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const body = within(document.body)
    await body.findByRole('heading', { name: 'Cancelar reserva' })
    await userEvent.click(body.getByRole('radio', { name: /El jugador pidió cancelar/ }))
    await waitFor(() =>
      expect(
        body.getByText(
          `Se aplica la política de cancelación: reembolso de ${money(CONFIRMADA_SENA_MP.depositAmount)} si está dentro del plazo, retención si no.`
        )
      ).toBeVisible()
    )

    await userEvent.type(
      body.getByLabelText('Motivo (obligatorio)'),
      'El jugador avisó que no puede ir.'
    )
    await userEvent.click(body.getByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() =>
      expect(args.cancelBookingAction).toHaveBeenCalledWith(
        uid(1015),
        'El jugador avisó que no puede ir.',
        'jugador'
      )
    )
    // El Dialog es modal (a diferencia del DropdownMenu de acciones): mientras sigue
    // montado, `hideOthers()` marca aria-hidden el viewport de toasts. Hay que
    // esperar a que cierre antes de poder clickear "Cerrar" del toast.
    await waitFor(() =>
      expect(body.queryByRole('heading', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    )
    await closeToast('Reserva cancelada')
  },
}

/** Sin seña pagada, cancelar solo libera el turno: no hay nada que reembolsar. */
export const CancelarSinSenaPagada: Story = {
  args: {
    booking: {
      ...CONFIRMADA_SENA_MP,
      id: uid(1016),
      depositStatus: 'not_required',
      depositAmount: 0,
      paymentMethod: 'cash',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const body = within(document.body)
    await body.findByRole('heading', { name: 'Cancelar reserva' })
    await userEvent.click(body.getByRole('radio', { name: /El complejo necesita cancelar/ }))
    await waitFor(() =>
      expect(
        body.getByText('Esta reserva no tiene seña pagada. Solo se libera el turno.')
      ).toBeVisible()
    )
  },
}

// ─── Mobile: menú contextual (regla de oro: axe escanea el menú ABIERTO) ──

/**
 * El menú mobile queda ABIERTO a propósito cuando termina el `play`: el scan de
 * axe (que corre DESPUÉS del play) tiene que evaluar ese estado, que es donde
 * vivía la violación real.
 *
 * Antes, `QuickActions` montaba `<DropdownMenu>` sin `modal` (default `modal=true`
 * de Radix), que llama `hideOthers()` y marca `aria-hidden` todo el árbol fuera
 * del portal —incluido el propio trigger, que sigue siendo focuseable— violando
 * `aria-hidden-focus`. El fix real fue `modal={false}` en el componente (ver el
 * comentario en QuickActions.tsx). Si esta story vuelve a fallar por
 * `aria-hidden-focus`, es que alguien revirtió ese fix — no hay que cerrar el
 * menú con `{Escape}` al final del play para taparlo.
 */
export const MenuMobileAbiertoConfirmada: Story = {
  args: { booking: CONFIRMADA_SENA_MP },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: `Acciones para ${args.label}` }))
    const menu = within(document.body)
    await expect(
      menu.findByRole('menuitem', { name: 'Marcar completada' })
    ).resolves.toBeInTheDocument()
    await expect(menu.getByRole('menuitem', { name: 'Marcar ausente' })).toBeInTheDocument()
    await expect(menu.getByRole('menuitem', { name: 'Cancelar reserva' })).toBeInTheDocument()
    await expect(menu.queryByRole('menuitem', { name: 'Confirmar pago' })).toBeNull()
  },
}

export const MenuMobileAbiertoPendientePago: Story = {
  args: { booking: PENDIENTE_PAGO },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: `Acciones para ${args.label}` }))
    const menu = within(document.body)
    await expect(
      menu.findByRole('menuitem', { name: 'Confirmar pago' })
    ).resolves.toBeInTheDocument()
    await expect(menu.queryByRole('menuitem', { name: 'Marcar completada' })).toBeNull()
    await expect(menu.queryByRole('menuitem', { name: 'Marcar ausente' })).toBeNull()
    await expect(menu.queryByRole('menuitem', { name: 'Cancelar reserva' })).toBeNull()
  },
}
