import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
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

/**
 * `onClose`/`onSaved` son fn() mudos en el sandbox: no realimentan `args.open`,
 * así que el diálogo de la story anterior puede seguir montado un frame → tomar
 * SIEMPRE el último (el de esta story), mismo patrón que StockEntryDialog.stories.tsx.
 */
async function findCurrentDialog(body: ReturnType<typeof within>) {
  const dialogs = await body.findAllByRole('dialog')
  return dialogs[dialogs.length - 1]!
}

/** Alta: campos vacíos, sin control de stock por default. */
export const NuevoProducto: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await findCurrentDialog(body)
    const dialog = within(dialogEl)
    // El Dialog entra con su propia animación (`data-[state=open]:animate-in
    // fade-in-0`): esperar a que asiente antes de leer visibilidad.
    await waitFor(() => expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible())

    await userEvent.type(dialog.getByLabelText('Nombre del producto'), 'Sanguchito')
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '3000')

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sanguchito', price: 300000 }),
      ),
    )
    // El cierre real lo controla el caller (`open` es prop del padre); en el
    // sandbox `onClose` es un fn() mudo que no realimenta `args.open`, así que
    // el diálogo nunca se desmonta — assertamos que el componente PIDIÓ
    // cerrar (mismo patrón que StockEntryDialog.stories.tsx).
    await waitFor(() => expect(args.onClose).toHaveBeenCalled())
  },
}

/** Edición: precarga los valores del producto existente. */
export const EditarProducto: Story = {
  args: { product: PRODUCT },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    // El Dialog entra con su propia animación (`data-[state=open]:animate-in
    // fade-in-0`): esperar a que asiente antes de leer visibilidad.
    await waitFor(() => expect(dialog.getByRole('heading', { name: 'Editar producto' })).toBeVisible())
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
    const dialog = within(await findCurrentDialog(body))
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, controlar' }))
    // Los campos entran con `animate-in fade-in` (StockEntryDialog): esperar
    // a que la animación asiente antes de leer visibilidad.
    await waitFor(() => expect(dialog.getByLabelText('Stock inicial')).toBeVisible())
    await waitFor(() => expect(dialog.getByLabelText('Stock mínimo (alerta)')).toBeVisible())
  },
}

/** Sin nombre: el error inline bloquea el guardado sin llegar a la action. */
export const ErrorSinNombre: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '1000')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ingresá un nombre/i)
    await expect(args.createProductAction).not.toHaveBeenCalled()
  },
}
