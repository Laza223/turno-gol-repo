import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
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
    startsOn: '2026-03-14',
    turn: { courtName: 'Cancha 2', timeStart: '21:00:00', timeEnd: '22:00:00' },
    view: 'retry',
    payUntil: '20:14',
    contact: { channel: 'whatsapp', href: '/whatsapp-de-la-story' },
    retryAction: fn(async () => undefined),
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingErrorCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Dentro de la ventana del hold: el turno sigue guardado, se dice cuál (día, hora y cancha) y hasta
 * qué hora del reloj se puede pagar, sin cuenta regresiva. Además de reintentar: elegir otro turno
 * (la ficha en ese día) o escribirle al complejo.
 */
export const DentroDeVentana: Story = {
  args: { view: 'retry' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'El pago no se procesó' })).toBeInTheDocument()
    await expect(
      canvas.getByText(/Tu turno sigue guardado: podés pagar hasta las 20:14/),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/^Sábado, 14 de marzo ·/).closest('p')).toHaveTextContent(
      'Sábado, 14 de marzo · 21:00 a 22:00 Cancha 2',
    )
    // Las únicas horas en pantalla son el plazo y las del turno: ningún mm:ss de cuenta regresiva.
    await expect(canvasElement.textContent?.match(/\d{1,2}:\d\d/g)).toEqual([
      '20:14',
      '21:00',
      '22:00',
    ])
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute(
      'href',
      '/complejo-fenix?date=2026-03-14',
    )
    const contact = canvas.getByRole('link', { name: 'Escribirle al complejo' })
    await expect(contact).toHaveAttribute('href', '/whatsapp-de-la-story')
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
    await expect(canvas.getByRole('link', { name: 'Escribirle al complejo' })).toBeInTheDocument()
  },
}

/** Sin número de WhatsApp válido: el contacto marca el teléfono, rotulado como tal. */
export const ReintentoConTelefono: Story = {
  args: { view: 'retry', contact: { channel: 'tel', href: 'tel:+541145550000' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const call = canvas.getByRole('link', { name: 'Llamar al complejo' })
    await expect(call).toHaveAttribute('href', 'tel:+541145550000')
    await expect(call).not.toHaveAttribute('target')
    await expect(canvas.queryByRole('link', { name: 'Escribirle al complejo' })).toBeNull()
  },
}

/** Sin nada marcable (o sin el plazo): no se dibuja el contacto y el texto no promete hora. */
export const ReintentoSinContacto: Story = {
  args: { view: 'retry', contact: null, payUntil: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: /al complejo/ })).toBeNull()
    await expect(canvas.getByText(/Tu turno sigue guardado\. Podés intentar/)).toBeInTheDocument()
  },
}

/** MercadoPago del complejo desconectado: el turno sigue, pero no se ofrece reintentar ni una hora. */
export const ReintentoNoDisponible: Story = {
  args: { view: 'unavailable', payUntil: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    await expect(canvas.getByText(/no se puede reintentar el pago desde acá/)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Escribirle al complejo' })).toBeInTheDocument()
  },
}

/** Otro pago de la reserva en revisión en MercadoPago: esperar, no pagar de nuevo. */
export const PagoEnRevision: Story = {
  args: { view: 'processing', payUntil: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Tenés un pago en revisión' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument()
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
