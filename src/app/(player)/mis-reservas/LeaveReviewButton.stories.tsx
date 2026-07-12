import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { LeaveReviewButton } from './LeaveReviewButton'

/**
 * Sin Server Action: hace `fetch('/api/player/reviews', {method:'POST'})`
 * directo. El Dialog (Radix) monta en un portal fuera de canvasElement: las
 * assertions post-apertura usan `screen`. El Toaster ya está montado global
 * en el preview (ver .storybook/preview.tsx) — no hace falta montarlo acá.
 */
const meta = {
  title: 'Player/MisReservas/LeaveReviewButton',
  component: LeaveReviewButton,
  parameters: { layout: 'centered' },
  args: { bookingId: 'booking-5', tenantName: 'Complejo Fénix' },
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
  },
}

/** 409: ya existía una reseña para esta reserva — el dialog se cierra igual. */
export const YaResenado: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: {}, status: 409 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[4])
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('Ya dejaste una reseña para esta reserva.')).toBeInTheDocument()
  },
}

export const ErrorGenerico: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: {}, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[2])
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('No pudimos guardar tu reseña.')).toBeInTheDocument()
  },
}

export const Exito: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/reviews', json: { data: { id: 'review-1' } } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /dejar reseña/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: /estrella/i })[4])
    await userEvent.type(within(dialog).getByLabelText(/comentario/i), 'Excelente cancha y atención.')
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar reseña/i }))
    await expect(await screen.findByText('¡Gracias por tu reseña!')).toBeInTheDocument()
  },
}
