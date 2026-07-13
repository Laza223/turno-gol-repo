import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { LeaveReviewButton } from './LeaveReviewButton'

/**
 * El Toaster vive fuera de `canvasElement` (portal fijo, montado global en
 * `.storybook/preview.tsx`) y anima entrada/salida con `animate-in`/
 * `animate-out` + `transition-all`. Sin esperar a que termine, axe puede
 * escanear a mitad de esa transición de color (`bg-destructive/10` en un
 * punto intermedio) y medir un contraste sin sentido. También el toast de la
 * story ANTERIOR recién sale del DOM 200ms después del dismiss que dispara
 * `ToastReaper` al cambiar de story (ver use-toast.ts) — por eso esperamos a
 * que no queden animaciones corriendo en la región de notificaciones antes
 * de dejar que el a11y scan corra.
 */
async function settleToasts() {
  await waitFor(async () => {
    const region = document.querySelector('[aria-label="Notifications (F8)"]')
    const running = region?.getAnimations({ subtree: true }).filter((a) => a.playState === 'running') ?? []
    if (running.length > 0) {
      await Promise.all(running.map((a) => a.finished)).catch(() => {})
      throw new Error('toast todavía animando')
    }
  })
}

/**
 * Sin Server Action: hace `fetch('/api/player/reviews', {method:'POST'})`
 * directo. El Dialog (Radix) monta en un portal fuera de canvasElement: las
 * assertions post-apertura usan `screen`. El Toaster ya está montado global
 * en el preview (ver .storybook/preview.tsx) — no hace falta montarlo acá.
 * El botón vive dentro de la card blanca (`bg-card`) de cada turno en
 * `MisReservasView` (nunca directo sobre el fondo gris de `<body>`,
 * `bg-background`) — el decorator reproduce esa card.
 */
const meta = {
  title: 'Player/MisReservas/LeaveReviewButton',
  component: LeaveReviewButton,
  parameters: { layout: 'centered' },
  args: { bookingId: 'booking-5', tenantName: 'Complejo Fénix' },
  decorators: [
    (Story) => (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeaveReviewButton>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {}

export const Abierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    await expect(await screen.findByText('¿Cómo estuvo Complejo Fénix?')).toBeInTheDocument()
  },
}

/** Rating: hover ilumina hasta el índice, click fija la selección. */
export const CalificacionSeleccionada: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const stars = await screen.findAllByRole('radio', { name: /estrella/i })
    await userEvent.click(stars[3]) // 4 estrellas
    await expect(stars[3]).toHaveAttribute('aria-checked', 'true')
    await expect(stars[4]).toHaveAttribute('aria-checked', 'false')
  },
}

/** Sin elegir calificación: toast de validación, el POST no llega a dispararse. */
export const SinCalificacion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('Elegí una calificación.')).toBeInTheDocument()
    await settleToasts()
  },
}

/** 409: ya existía una reseña para esta reserva — el dialog se cierra igual. */
export const YaResenado: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: {}, status: 409 }],
  },
  play: async ({ canvasElement }) => {
    // Barre el toast destructivo (persiste hasta dismiss) que pudo dejar la
    // story anterior (`SinCalificacion`) antes de generar uno nuevo.
    await settleToasts()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[4])
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('Ya dejaste una reseña para esta reserva.')).toBeInTheDocument()
    await settleToasts()
  },
}

export const ErrorGenerico: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: {}, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    await settleToasts()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[2])
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('No pudimos guardar tu reseña.')).toBeInTheDocument()
    await settleToasts()
  },
}

export const Exito: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: { data: { id: 'review-1' } } }],
  },
  play: async ({ canvasElement }) => {
    await settleToasts()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[4])
    await userEvent.type(within(dialog).getByLabelText(/comentario/i), 'Excelente cancha y atención.')
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('¡Gracias por tu reseña!')).toBeInTheDocument()
    await settleToasts()
  },
}
