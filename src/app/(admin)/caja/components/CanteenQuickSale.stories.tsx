import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { artDateString, tenantSettings } from '@/test/fixtures'
import { CanteenQuickSale } from './CanteenQuickSale'
import type { CanteenProductsActionResult, CashFlowActionResult } from '../actions'

const PRODUCTS = tenantSettings().canteen_products ?? []

/** Vive suelto sobre `bg-background` en caja/page.tsx (define su propia superficie `bg-card`). */
const meta = {
  title: 'Admin/Caja/CanteenQuickSale',
  component: CanteenQuickSale,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    products: PRODUCTS,
    createCashFlowAction: fn(
      async (): Promise<CashFlowActionResult> => ({
        success: true,
        cashFlow: {
          id: 'cf-1',
          tenantId: 't-1',
          type: 'income',
          category: 'product_sale',
          amount: 250000,
          method: 'cash',
          description: 'Gatorade 500ml',
          bookingId: null,
          productId: 'p-1',
          registeredBy: 's-1',
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      }),
    ),
    saveCanteenProductsAction: fn(async (): Promise<CanteenProductsActionResult> => ({ success: true })),
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

    const dialog = within(body.getByRole('dialog'))
    await expect(dialog.getByRole('heading', { name: PRODUCTS[0]!.name })).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Sumar uno' }))
    await expect(dialog.getByText('2')).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Transferencia' }))
    await userEvent.click(dialog.getByRole('button', { name: /registrar venta/i }))

    await expect(args.createCashFlowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'product_sale',
        method: 'transfer',
        description: `${PRODUCTS[0]!.name} x2`,
        amount: PRODUCTS[0]!.price * 2,
      }),
    )
  },
}

/** "Configurar" abre el editor: arranca con los productos actuales, se puede agregar/quitar/guardar. */
export const EditorDeProductos: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar' }))

    const dialog = within(body.getByRole('dialog'))
    await expect(dialog.getAllByLabelText('Nombre del producto')).toHaveLength(PRODUCTS.length)

    await userEvent.click(dialog.getByRole('button', { name: '+ Agregar producto' }))
    const names = dialog.getAllByLabelText('Nombre del producto')
    await userEvent.type(names[names.length - 1]!, 'Sanguchito')
    const prices = dialog.getAllByLabelText('Precio en pesos')
    await userEvent.type(prices[prices.length - 1]!, '3000')

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await expect(args.saveCanteenProductsAction).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Sanguchito', price: 300000 })]),
    )
  },
}

/** Editor sin productos todavía: ofrece cargar la lista sugerida de un tirón. */
export const EditorSinProductosCargaSugeridos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar productos' }))

    const dialog = within(body.getByRole('dialog'))
    await userEvent.click(
      dialog.getByRole('button', { name: /cargar sugeridos/i }),
    )
    await expect(dialog.getByDisplayValue('Agua')).toBeVisible()
    await expect(dialog.getByDisplayValue('Gatorade')).toBeVisible()
    await expect(dialog.getByDisplayValue('Cerveza')).toBeVisible()
  },
}

/** La venta falla del lado del servidor: error inline, el diálogo sigue abierto. */
export const ErrorDeVenta: Story = {
  args: {
    createCashFlowAction: fn(
      async (): Promise<CashFlowActionResult> => ({
        success: false,
        error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(PRODUCTS[0]!.name) }))

    const dialog = within(body.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: /registrar venta/i }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
  },
}
