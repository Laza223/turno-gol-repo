import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import type { SellTicketActionResult } from '../../caja/cantina/actions'
import { BookingCanteenDialog } from './BookingCanteenDialog'

/**
 * Cantina cargada a un turno desde la grilla.
 *
 * Acá va SOLO el estado de error: el catálogo cargado es el `TicketPanel` real
 * de /caja/cantina, que ya tiene sus propias stories — duplicarlo mediría dos
 * veces lo mismo. Lo que no medía nadie era este camino: el aviso de que el
 * catálogo no cargó aparece recién cuando la Server Action falla, así que axe
 * nunca lo veía.
 */
const meta = {
  title: 'Admin/Grilla/BookingCanteenDialog',
  component: BookingCanteenDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onOpenChange: fn(),
    bookingId: uid(1001),
    displayName: 'Marcelo Ruiz',
    listCatalogAction: fn(async () => ({
      success: false as const,
      error: 'No pudimos cargar la cantina. Revisá tu conexión.',
    })),
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => ({
      success: true,
      total: 300000,
    })),
  },
} satisfies Meta<typeof BookingCanteenDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El catálogo no cargó: se dice por qué en vez de quedar en "Cargando…" para
 * siempre, y no se ofrece vender sobre un stock que no se conoce.
 */
export const ErrorDeCatalogo: Story = {
  play: async ({ canvasElement }) => {
    // El diálogo va a un portal fuera del canvas.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('alert')).toHaveTextContent(/No pudimos cargar la cantina/)
    await expect(body.queryByText('Cargando cantina…')).toBeNull()
  },
}

/**
 * El MISMO error, en tema oscuro.
 *
 * Antes de esta tanda el repo no tenía UNA sola story en dark (`globals.theme`
 * quedaba siempre en 'light'), así que axe venía midiendo medio design system.
 * Y el lado sin medir era justo donde el rojo del token se cae:
 * `text-destructive` es red-600 en los dos temas, y sobre la superficie oscura
 * daba 3.87:1.
 */
export const ErrorDeCatalogoOscuro: Story = {
  ...ErrorDeCatalogo,
  globals: { theme: 'dark' },
}
