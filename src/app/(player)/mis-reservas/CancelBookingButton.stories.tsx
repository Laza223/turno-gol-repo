import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { CancelBookingButton } from './CancelBookingButton'

/**
 * El toast destructivo persiste y anima: se espera a que no quede ninguna
 * animación corriendo antes de que axe escanee (mismo motivo y mismo selector que
 * en LeaveReviewButton.stories).
 */
async function settleToasts() {
  await waitFor(() => {
    const region = document.querySelector('[aria-label="Notifications (F8)"]')
    const running =
      region?.getAnimations({ subtree: true }).filter((a) => a.playState === 'running') ?? []
    if (running.length > 0) throw new Error('toast todavía animando')
  })
}

/**
 * La Server Action entra por prop (ver el comentario en CancelBookingButton.tsx).
 * ConfirmDialog (Radix) monta en un portal fuera de canvasElement: las
 * assertions post-apertura usan `screen`.
 *
 * El decorator reproduce el `bg-card` (blanco) de la fila de reserva en
 * MisReservasView.tsx: el botón nunca vive suelto sobre `bg-background`
 * (slate ~#DDE3EC), y ahí `text-red-600` da 3.88:1 (falla AA) contra el
 * 4.83:1 que da sobre `bg-card`.
 */
const meta = {
  title: 'Player/MisReservas/CancelBookingButton',
  component: CancelBookingButton,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: {
    bookingId: 'booking-1',
    courtName: 'Cancha 1',
    dateLabel: 'sáb 14 mar',
    timeLabel: '18:00 a 19:00',
    cancellationOutcome: 'refund',
    depositAmountCents: 150_000,
  },
  decorators: [
    // El diálogo monta en <body>, fuera del decorador.
    (Story) => (
      <div className="rounded-xl border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CancelBookingButton>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
}

/**
 * El texto del preview de seña (`depositPreviewText`) no vive en un nodo
 * propio: es el último hijo-texto directo del `description` de ConfirmDialog,
 * después de `<strong>`s y dos `<br/>`. `getByText` con un string exacto
 * concatena TODO el texto directo del contenedor (`getNodeText`, ignora los
 * `<strong>`/`<br/>` pero no el resto de los textos hermanos), así que nunca
 * matchea el string aislado — de ahí el matcher por función (RTL normaliza
 * `content` con la misma regla `\s+` que colapsa el NBSP de `formatArs` a
 * espacio simple, así que tampoco hace falta lidiar con eso a mano).
 */
const hasText = (target: string) => (content: string) => content.includes(target)

export const Abierto: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText('¿Cancelar esta reserva?')).toBeInTheDocument()
    const field = screen.getByLabelText(/motivo \(opcional\)/i)
    await expect(field).toBeInTheDocument()
    await expect(field).toHaveClass('text-base')
    // ENS-2: la consecuencia concreta de cancelar AHORA (no más "en el plazo/fuera del plazo" en abstracto).
    await expect(
      screen.getByText(hasText('Se te devuelve la seña de $ 1.500.')),
    ).toBeInTheDocument()
  },
}

/** ENS-2: sin seña paga, el modal avisa que no hay nada que devolver. */
export const AbiertoSinSeña: Story = {
  args: {
    action: fn(async () => ({ success: true as const, booking: {} as never })),
    cancellationOutcome: 'no_deposit',
    depositAmountCents: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText(hasText('No hay seña que devolver.'))).toBeInTheDocument()
  },
}

/** Sin seña y con la penalidad por cancelar tarde: la 2da lleva a 7 días sin reservar online. */
export const AbiertoCancelacionTardia: Story = {
  args: {
    action: fn(async () => ({ success: true as const, booking: {} as never })),
    cancellationOutcome: 'no_deposit',
    depositAmountCents: 0,
    tenantName: 'El Vagón',
    lateCancel: { kind: 'ban', days: 7, hours: 4 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(
      await screen.findByText(hasText('no vas a poder reservar online en El Vagón por 7 días')),
    ).toBeInTheDocument()
  },
}

/** ENS-2: fuera de la ventana de reembolso, el jugador pierde la seña. */
export const AbiertoFueraDePlazo: Story = {
  args: {
    action: fn(async () => ({ success: true as const, booking: {} as never })),
    cancellationOutcome: 'no_refund',
    depositAmountCents: 150_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText(hasText('Perdés la seña de $ 1.500.'))).toBeInTheDocument()
  },
}

/** Error transitorio (rate limit, complejo no disponible): queda inline y el diálogo sigue abierto. */
export const ErrorAlCancelar: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'Demasiadas solicitudes. Esperá un momento.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    const alert = await screen.findByRole('alert')
    await expect(alert).toHaveTextContent('Demasiadas solicitudes. Esperá un momento.')
    await expect(parseFloat(getComputedStyle(alert).fontSize)).toBeGreaterThanOrEqual(13)
    await expect(screen.getByRole('dialog')).toBeInTheDocument()
  },
}

/**
 * La action LANZA (se perdió la respuesta): la reserva pudo haberse cancelado
 * igual. Se refresca la lista y el aviso dice la verdad (en vez del "Revisá tu
 * conexión e intentá de nuevo" que mandaba a reintentar a ciegas), en el Toaster y
 * con el diálogo cerrado: con el `router.refresh()` en vuelo un mensaje inline no
 * se pinta, y el `refresh` de este mock es sincrónico, así que NO lo reproduce
 * (ese caso lo cubre `tests/unit/cancel-booking-button.test.tsx`, con un router
 * que suspende la transición como el real).
 */
export const ErrorDeRed: Story = {
  args: {
    action: fn(async () => {
      throw new Error('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    await expect(
      await screen.findByText(/No pudimos confirmar si se canceló.*si sigue, probá de nuevo/),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(getRouter().refresh).toHaveBeenCalled()
    await settleToasts()
  },
}

/**
 * Error de ESTADO (`stale`): la reserva ya no está viva. Reintentar no sirve, así
 * que el aviso va al Toaster global y el diálogo se cierra (la revalidación pudo
 * haber sacado la tarjeta, y el diálogo con ella).
 */
export const YaCanceladaPorElComplejo: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'El complejo ya canceló esta reserva.',
      stale: true as const,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    await expect(
      await screen.findByText('El complejo ya canceló esta reserva.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await settleToasts()
  },
}

/**
 * Éxito: la action recibe el motivo y el diálogo se cierra solo.
 *
 * Ya NO se espera un `router.refresh()`: la Server Action termina con
 * `revalidatePath('/mis-reservas')`, así que el refresh del cliente era
 * redundante — y, peor, era lo que hacía desaparecer el aviso de la
 * devolución, porque al reordenarse la lista React desmontaba esta tarjeta con
 * todo lo que colgara de ella. El panel de contacto ahora lo muestra
 * `RefundDialogProvider`, que vive por encima de la lista.
 */
export const CanceladoOk: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(/motivo \(opcional\)/i),
      'Se suspendió por lluvia',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    await expect(args.action).toHaveBeenCalledWith('booking-1', 'Se suspendió por lluvia')
    await waitFor(async () =>
      expect(screen.queryByText('¿Cancelar esta reserva?')).not.toBeInTheDocument(),
    )
  },
}
