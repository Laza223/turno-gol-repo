import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { RESERVAR_COLUMN } from '../CheckoutStates'
import BookingSummary, { type BookingSummaryData } from './BookingSummary'

const base: BookingSummaryData = {
  tenantName: 'Complejo Fénix',
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  courtName: 'Cancha 2',
  courtFormat: 5,
  date: '2026-03-14',
  timeStart: '18:00',
  timeEnd: '19:00',
  price: 1500000,
  depositAmount: 0,
}

/** El resumen vive en la columna de ~560 px de la pantalla de confirmar, dentro del mundo del portal. */
const meta = {
  title: 'Player/Checkout/BookingSummary',
  component: BookingSummary,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <div className={RESERVAR_COLUMN}>
            <Story />
          </div>
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof BookingSummary>

export default meta
type Story = StoryObj<typeof meta>

/** Precios a la vista, sin seña: el precio del turno y nada más (dónde se paga lo dice el pago). */
export const ConPrecios: Story = {
  args: { data: base },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Complejo Fénix' })).toBeVisible()
    await expect(
      canvas.getByText('Av. Rivadavia 4820, Ciudad Autónoma de Buenos Aires'),
    ).toBeVisible()
    await expect(canvas.getByText('18:00 a 19:00')).toBeVisible()
    // El formato sale de la cancha: "Cancha 2 · Fútbol 5".
    await expect(canvas.getByText('Cancha 2 · Fútbol 5')).toBeVisible()
    await expect(canvas.getByText('Precio del turno')).toBeVisible()
    await expect(canvas.queryByText('Seña a pagar ahora')).not.toBeInTheDocument()
  },
}

/** Con seña: el monto a pagar ahora y el resto que queda en el complejo. */
export const ConSena: Story = {
  args: { data: { ...base, depositAmount: 450000 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Seña a pagar ahora')).toBeVisible()
    // formatArs separa "$" del monto con NBSP (U+00A0); getByText normaliza el
    // textContent a espacio común (\s+ → ' ', y \s matchea NBSP) — el matcher
    // usa espacio común, no NBSP.
    await expect(canvas.getByText('$ 4.500')).toBeVisible()
    await expect(canvas.getByText('Resto en el complejo')).toBeVisible()
  },
}

/**
 * El complejo oculta sus precios (El Vagón): ningún monto y tampoco cómo se paga, que lo dice la
 * sección de pago justo debajo (si no, la misma frase salía dos veces).
 */
export const PreciosOcultos: Story = {
  args: { data: { ...base, hidePrices: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancha 2 · Fútbol 5')).toBeVisible()
    await expect(canvasElement.textContent).not.toContain('$')
    await expect(canvas.queryByText(/pagás/i)).not.toBeInTheDocument()
  },
}

/** Ocultos y con seña: el resumen sigue sin montos ni medios de pago; MercadoPago lo dice el pago. */
export const PreciosOcultosConSena: Story = {
  args: { data: { ...base, depositAmount: 450000, hidePrices: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toContain('$')
    await expect(canvasElement.textContent).not.toMatch(/MercadoPago|seña/i)
  },
}

/** Nombre, dirección y cancha largos: se parten en vez de romper el ancho. */
export const TextosLargos: Story = {
  args: {
    data: {
      ...base,
      tenantName: 'Complejo Deportivo Los Hermanos del Sur y Asociados',
      address: 'Av. Presidente Juan Domingo Perón y Ruta Provincial 24, km 3,5',
      courtName: 'Cancha 12 (techada, con césped sintético de última generación)',
      courtFormat: 11,
    },
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}
