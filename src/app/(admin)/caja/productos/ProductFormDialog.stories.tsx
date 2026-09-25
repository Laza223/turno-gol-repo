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
    categorySuggestions: [],
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

/**
 * Alta: campos vacíos y CON control de stock por default — el 90 % de lo que
 * vende una cantina se cuenta. El stock inicial es obligatorio: sin él el
 * producto nacería "Agotado" y no se podría vender.
 */
export const NuevoProducto: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await findCurrentDialog(body)
    const dialog = within(dialogEl)
    // El Dialog entra con su propia animación (`data-[state=open]:animate-in
    // fade-in-0`): esperar a que asiente antes de leer visibilidad.
    await waitFor(() =>
      expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible(),
    )
    await expect(dialog.getByRole('button', { name: 'Sí, controlar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.type(dialog.getByLabelText('Nombre del producto'), 'Gaseosa 500ml')
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '3000')
    await userEvent.type(dialog.getByLabelText('Stock inicial'), '24')
    await userEvent.type(dialog.getByLabelText('Stock mínimo (alerta)'), '6')

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Gaseosa 500ml', price: 300000, stock: 24, minStock: 6 }),
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
    await waitFor(() =>
      expect(dialog.getByRole('heading', { name: 'Editar producto' })).toBeVisible(),
    )
    await expect(dialog.getByDisplayValue(PRODUCT.name)).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.updateProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ productId: PRODUCT.id }),
      ),
    )
  },
}

/**
 * Un servicio o alquiler se elige a propósito: "No controlar" esconde los
 * campos de stock y el alta sale con `stock: null` (sin límite de unidades).
 */
export const ServicioSinStock: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    await waitFor(() => expect(dialog.getByLabelText('Stock inicial')).toBeVisible())

    await userEvent.click(dialog.getByRole('button', { name: 'No controlar' }))
    await waitFor(() => expect(dialog.queryByLabelText('Stock inicial')).toBeNull())

    await userEvent.type(dialog.getByLabelText('Nombre del producto'), 'Alquiler de pecheras')
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '2000')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(args.createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Alquiler de pecheras', stock: null }),
      ),
    )
  },
}

/** Con control de stock, el alta sin stock inicial no sale: nacería agotado. */
export const ErrorSinStockInicial: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    await userEvent.type(dialog.getByLabelText('Nombre del producto'), 'Agua')
    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '1500')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/stock inicial/i)
    await expect(args.createProductAction).not.toHaveBeenCalled()
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

/**
 * Con precio y costo, la ganancia por unidad se dice en palabras (no "margen");
 * vender por debajo del costo se dice como pérdida. Cada campo trae su línea de
 * ayuda colgada por `aria-describedby`.
 */
export const GananciaYAyudas: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    // Mismo resguardo que el resto del archivo: esperar a que el diálogo de
    // ESTA story termine de entrar antes de tocar campos.
    await waitFor(() =>
      expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible(),
    )

    await expect(dialog.getByLabelText('Stock mínimo (alerta)')).toHaveAccessibleDescription(
      /te avisamos que hay que reponer/,
    )
    await expect(dialog.getByLabelText('Costo (opcional)')).toHaveAccessibleDescription(
      /cuánto ganás/,
    )

    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '3000')
    await userEvent.type(dialog.getByLabelText('Costo (opcional)'), '1800')
    await expect(
      await dialog.findByText(/Ganás .*1\.200 por unidad \(40 % del precio\)/),
    ).toBeVisible()
  },
}

/** Por debajo del costo se dice como pérdida, no como un porcentaje negativo. */
export const PerdidaPorUnidad: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    await waitFor(() =>
      expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible(),
    )

    await userEvent.type(dialog.getByLabelText('Precio (pesos)'), '1000')
    await userEvent.type(dialog.getByLabelText('Costo (opcional)'), '1500')
    await expect(await dialog.findByText(/Perdés .*500 por unidad/)).toBeVisible()
  },
}
