import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { uid } from '@/test/fixtures/ids'
import { BookingErrorCard } from './BookingErrorCard'

/**
 * `retryAction` entra por prop: `.../reservar/actions` es `'use server'` y
 * arrastra `node:async_hooks` si se importa como valor (ver el comentario en
 * el componente). El resultado vive en el mundo del portal (`reserva/layout.tsx`).
 * Dice qué pasó con el pago Y con el turno, y qué hacer.
 */
const meta = {
  title: 'Player/BookingResult/BookingErrorCard',
  component: BookingErrorCard,
  parameters: { layout: 'fullscreen' },
  args: {
    bookingId: uid(1002),
    tenantSlug: 'complejo-fenix',
    date: '2026-03-14',
    turn: { courtName: 'Cancha 2', timeStart: '21:00:00', timeEnd: '22:00:00' },
    view: 'retry',
    retryAction: fn(async () => undefined),
  },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof BookingErrorCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Dentro de la ventana del hold (DEFAULT_EXPIRY_SECONDS): el turno sigue guardado y se dice cuál
 * (día, hora y cancha), sin cuenta regresiva ni cuánto falta.
 */
export const DentroDeVentana: Story = {
  args: { view: 'retry' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'El pago no se procesó' })).toBeInTheDocument()
    await expect(canvas.getByText(/Tu turno sigue guardado por poco tiempo/)).toBeInTheDocument()
    await expect(canvas.getByText(/^Sábado, 14 de marzo ·/).closest('p')).toHaveTextContent(
      'Sábado, 14 de marzo · 21:00 a 22:00 Cancha 2',
    )
    // Las únicas horas en pantalla son las del turno: ningún mm:ss de cuenta regresiva.
    await expect(canvasElement.textContent?.match(/\d{1,2}:\d\d/g)).toEqual(['21:00', '22:00'])
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar pago' }))
    await expect(args.retryAction).toHaveBeenCalledTimes(1)
  },
}

/** El hold ya expiró: el worker liberó el turno; "Reservar de nuevo" abre la ficha en ese día. */
export const FueraDeVentana: Story = {
  args: { view: 'released' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'El pago no se procesó' })).toBeInTheDocument()
    await expect(canvas.getByText(/el turno ya no está guardado/)).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reintentar pago' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute(
      'href',
      '/complejo-fenix?date=2026-03-14',
    )
  },
}

/** Sin tenantSlug (edge case defensivo): "Reservar de nuevo" cae al buscador. */
export const FueraDeVentanaSinSlug: Story = {
  args: { view: 'released', tenantSlug: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}

/** Cancelada: lo dice, y no hay un pago para reintentar. */
export const Cancelada: Story = {
  args: { view: 'canceled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Reserva cancelada' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reintentar pago' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument()
  },
}

/** Ya se jugó (o no se fue): no hay un pago para reintentar. */
export const YaPaso: Story = {
  args: { view: 'past' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Esta reserva ya pasó' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reintentar pago' })).not.toBeInTheDocument()
  },
}
