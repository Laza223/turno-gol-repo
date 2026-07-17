import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
import { artDateString, tenantSettings } from '@/test/fixtures'
import { CanteenQuickSale } from './CanteenQuickSale'
import type { CanteenProductsActionResult, SellCanteenProductResult } from '../actions'

const PRODUCTS = tenantSettings().canteen_products ?? []

/** Vive suelto sobre `bg-background` en caja/page.tsx (define su propia superficie `bg-card`). */
const meta = {
  title: 'Admin/Caja/CanteenQuickSale',
  component: CanteenQuickSale,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    products: PRODUCTS,
    sellCanteenProductAction: fn(
      async (): Promise<SellCanteenProductResult> => ({
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

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // interactuar, si no el toBeVisible() puede pescar opacity todavía en 0.
    await waitFor(() => expect(dialog.getByRole('heading', { name: PRODUCTS[0]!.name })).toBeVisible())

    await userEvent.click(dialog.getByRole('button', { name: 'Sumar uno' }))
    await expect(dialog.getByText('2')).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Transferencia' }))
    await userEvent.click(await dialog.findByRole('button', { name: /registrar venta/i }))

    await expect(args.sellCanteenProductAction).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCTS[0]!.id,
        method: 'transfer',
        qty: 2,
      }),
    )
    // La venta OK cierra el diálogo (onClose): esperar a que termine su
    // animación de salida y se remueva, si no la siguiente aserción de axe
    // puede pescarlo a mitad de transición (heading vacío, sin nombre accesible).
    await waitForElementToBeRemoved(dialogEl)
  },
}

/** "Configurar" abre el editor: arranca con los productos actuales, se puede agregar/quitar/guardar. */
export const EditorDeProductos: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar' }))

    // findByRole, no getByRole: el editor de productos entra por next/dynamic. Un
    // getByRole es SÍNCRONO — no espera nada, y corre una carrera contra la carga del
    // chunk que a veces gana y a veces pierde.
    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
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
    // Guardar cierra el diálogo (onClose): mientras Radix lo anima hacia
    // afuera, el resto de la página (incluido el toast) queda aria-hidden por
    // el focus trap — hay que esperar a que se remueva antes de poder
    // interactuar con el botón "Cerrar" del toast.
    await waitForElementToBeRemoved(dialogEl)
    // El toast (variant success) sobrevive al cambio de story: cerrarlo acá
    // evita que la siguiente story lo agarre a mitad de la animación de
    // salida (color transitorio => falso positivo de axe).
    const toastText = await body.findByText('Productos guardados')
    const toastItem = toastText.closest('li')
    if (!toastItem) throw new Error('No se encontró el toast')
    await userEvent.click(within(toastItem).getByRole('button', { name: 'Cerrar' }))
    await waitForElementToBeRemoved(toastText)
  },
}

/** Editor sin productos todavía: ofrece cargar la lista sugerida de un tirón. */
export const EditorSinProductosCargaSugeridos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar productos' }))

    const dialog = within(await body.findByRole('dialog'))
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: /cargar sugeridos/i })).toBeVisible(),
    )
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
    sellCanteenProductAction: fn(
      async (): Promise<SellCanteenProductResult> => ({
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
