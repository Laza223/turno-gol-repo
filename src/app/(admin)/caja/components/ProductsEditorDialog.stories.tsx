import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
import { tenantSettings } from '@/test/fixtures'
import { ProductsEditorDialog } from './ProductsEditorDialog'
import type { CanteenProductsActionResult } from '../actions'

const PRODUCTS = tenantSettings().canteen_products ?? []

/**
 * Ex-editor inline de CanteenQuickSale, ahora vive en su propia tab
 * (/caja/productos, vía ProductsManager). Radix Dialog monta en un portal
 * fuera de `canvasElement` — las assertions usan `within(document.body)`.
 */
const meta = {
  title: 'Admin/Caja/ProductsEditorDialog',
  component: ProductsEditorDialog,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    products: PRODUCTS,
    onClose: fn(),
    onSaved: fn(),
    saveCanteenProductsAction: fn(async (): Promise<CanteenProductsActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof ProductsEditorDialog>

export default meta
type Story = StoryObj<typeof meta>

/** El editor arranca con los productos actuales, se puede agregar/quitar/guardar. */
export const EditorDeProductos: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
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
export const SinProductosCargaSugeridos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: /cargar sugeridos/i })).toBeVisible(),
    )
    await userEvent.click(dialog.getByRole('button', { name: /cargar sugeridos/i }))
    await expect(dialog.getByDisplayValue('Agua')).toBeVisible()
    await expect(dialog.getByDisplayValue('Gatorade')).toBeVisible()
    await expect(dialog.getByDisplayValue('Cerveza')).toBeVisible()
  },
}
