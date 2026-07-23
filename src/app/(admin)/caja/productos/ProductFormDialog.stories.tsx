import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
import { canteenProduct } from '@/test/fixtures'
import { ProductFormDialog } from './ProductFormDialog'
import type { ProductActionResult } from './actions'

const PRODUCT = canteenProduct()

const meta = {
  title: 'Admin/Caja/Productos/ProductFormDialog',
  component: ProductFormDialog,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    product: null,
    onClose: fn(),
    onSaved: fn(),
    createProductAction: fn(async (): Promise<ProductActionResult> => ({ success: true })),
    updateProductAction: fn(async (): Promise<ProductActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof ProductFormDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Alta: campos vacíos, sin control de stock por default. */
export const NuevoProducto: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible()

    await userEvent.type(dialog.getByLabelText('Nombre'), 'Sanguchito')
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '3000')

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sanguchito', price: 300000 }),
      ),
    )
    await waitForElementToBeRemoved(dialogEl)
  },
}

/** Edición: precarga los valores del producto existente. */
export const EditarProducto: Story = {
  args: { product: PRODUCT },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await expect(dialog.getByRole('heading', { name: 'Editar producto' })).toBeVisible()
    await expect(dialog.getByDisplayValue(PRODUCT.name)).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.updateProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ productId: PRODUCT.id }),
      ),
    )
  },
}

/** Activar el toggle "Controlar stock" revela los campos de stock inicial/mínimo. */
export const ControlDeStock: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, controlar' }))
    await expect(dialog.getByLabelText('Stock inicial')).toBeVisible()
    await expect(dialog.getByLabelText('Stock mínimo (alerta)')).toBeVisible()
  },
}

/** Sin nombre: el error inline bloquea el guardado sin llegar a la action. */
export const ErrorSinNombre: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '1000')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ingresá un nombre/i)
    await expect(args.createProductAction).not.toHaveBeenCalled()
  },
}
