import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { canteenProducts } from '@/test/fixtures'
import { CanteenQuickSale } from './CanteenQuickSale'
import type { SellTicketActionResult } from '../cantina/actions'

const PRODUCTS = canteenProducts()

/** Vive suelto sobre `bg-background` en caja/cantina/page.tsx (define su propia superficie `bg-card`). */
const meta = {
  title: 'Admin/Caja/CanteenQuickSale',
  component: CanteenQuickSale,
  parameters: { layout: 'padded' },
  args: {
    products: PRODUCTS,
    sellTicketAction: fn(
      async (): Promise<SellTicketActionResult> => ({ success: true, total: 250000 }),
    ),
  },
} satisfies Meta<typeof CanteenQuickSale>

export default meta
type Story = StoryObj<typeof meta>

export const ConProductos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const p of PRODUCTS) {
      await expect(canvas.getByRole('button', { name: new RegExp(p.name) })).toBeVisible()
    }
  },
}

export const SinProductos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/cargá tus productos/i)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Configurar productos' })).toBeVisible()
  },
}

/** Un toque sobre un producto abre la venta rápida con cantidad y método. */
export const VentaRapida: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(PRODUCTS[0]!.name) }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // interactuar, si no el toBeVisible() puede pescar opacity todavía en 0.
    await waitFor(() => expect(dialog.getByRole('heading', { name: PRODUCTS[0]!.name })).toBeVisible())

    await userEvent.click(dialog.getByRole('button', { name: 'Sumar uno' }))
    await expect(dialog.getByText('2')).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Transferencia' }))
    await userEvent.click(await dialog.findByRole('button', { name: /registrar venta/i }))

    await expect(args.sellTicketAction).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ productId: PRODUCTS[0]!.id, qty: 2 }],
        method: 'transfer',
      }),
    )
    // La venta OK cierra el diálogo (onClose): esperar a que termine su
    // animación de salida y se remueva, si no la siguiente aserción de axe
    // puede pescarlo a mitad de transición (heading vacío, sin nombre accesible).
    await waitForElementToBeRemoved(dialogEl)
  },
}

/**
 * "Configurar" (header, pencil) ya no abre un editor inline: el catálogo de
 * productos vive en su propia tab (/caja/productos). Sin `onConfigureClick`
 * (uso normal en /caja/cantina), el default navega ahí con el query param que
 * auto-abre el editor del lado del destino.
 */
export const ConfigurarNavegaAProductos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/caja/productos?configureCanteen=true')
  },
}

/** La venta falla del lado del servidor: error inline, el diálogo sigue abierto. */
export const ErrorDeVenta: Story = {
  args: {
    sellTicketAction: fn(
      async (): Promise<SellTicketActionResult> => ({
        success: false,
        error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(PRODUCTS[0]!.name) }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(await dialog.findByRole('button', { name: /registrar venta/i }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
  },
}
