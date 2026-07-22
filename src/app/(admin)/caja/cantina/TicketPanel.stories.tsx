import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { canteenProducts } from '@/test/fixtures'
import { TicketPanel } from './TicketPanel'
import type { SellTicketActionResult } from './actions'

const PRODUCTS = canteenProducts()

const meta = {
  title: 'Admin/Caja/Cantina/TicketPanel',
  component: TicketPanel,
  parameters: { layout: 'padded' },
  args: {
    products: PRODUCTS,
    sellTicketAction: fn(
      async (): Promise<SellTicketActionResult> => ({ success: true, total: 300000 }),
    ),
  },
} satisfies Meta<typeof TicketPanel>

export default meta
type Story = StoryObj<typeof meta>

export const ConProductos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const p of PRODUCTS) {
      await expect(canvas.getByRole('button', { name: new RegExp(p.name) })).toBeVisible()
    }
    await expect(canvas.getByText('Tocá un producto para empezar')).toBeVisible()
  },
}

export const SinProductos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/cargá tus productos/i)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar productos' }))
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith('/caja/productos?configureCanteen=true'),
    )
  },
}

/**
 * Regla de oro (Fase 3): venta de 1 ítem = 2 taps — tap producto, tap Cobrar.
 * Sin diálogo intermedio (a diferencia de la vieja CanteenQuickSale).
 */
export const VentaDeUnItem: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    await userEvent.click(canvas.getByRole('button', { name: new RegExp(product.name) }))
    await expect(canvas.getByText('×1')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [{ productId: product.id, qty: 1 }],
          method: 'cash',
        }),
      ),
    )
    // Éxito: el ticket se vacía (vuelve el hint) — listo para la próxima venta.
    await waitFor(() => expect(canvas.getByText('Tocá un producto para empezar')).toBeVisible())
  },
}

/** Dos productos distintos en un mismo ticket: un solo Cobrar cobra todo junto. */
export const VentaMultiItem: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const [productA, productB] = PRODUCTS

    await userEvent.click(canvas.getByRole('button', { name: new RegExp(productA!.name) }))
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(productA!.name) }))
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(productB!.name) }))
    await expect(canvas.getByText('×2')).toBeVisible()
    await expect(canvas.getByText('×1')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Transferencia' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { productId: productA!.id, qty: 2 },
            { productId: productB!.id, qty: 1 },
          ],
          method: 'transfer',
        }),
      ),
    )
  },
}

/** El botón "−" no baja de 1; "Quitar" (tacho) saca la línea entera. */
export const QuitarLinea: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    await userEvent.click(canvas.getByRole('button', { name: new RegExp(product.name) }))
    await expect(canvas.getByText('×1')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: `Quitar ${product.name} del ticket` }))
    await expect(canvas.getByText('Tocá un producto para empezar')).toBeVisible()
  },
}

/** La venta falla del lado del servidor: error inline, el ticket NO se vacía. */
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
    const product = PRODUCTS[0]!

    await userEvent.click(canvas.getByRole('button', { name: new RegExp(product.name) }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
    // El ticket sigue con la línea cargada (no se pierde el trabajo del cajero).
    await expect(canvas.getByText('×1')).toBeVisible()
  },
}
