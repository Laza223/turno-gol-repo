import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { canteenProduct } from '@/test/fixtures'
import { StockEntryDialog } from './StockEntryDialog'
import type { StockActionResult } from './actions'

const PRODUCT = canteenProduct()

const meta = {
  title: 'Admin/Caja/Productos/StockEntryDialog',
  component: StockEntryDialog,
  parameters: { layout: 'padded' },
  args: {
    product: PRODUCT,
    onClose: fn(),
    onSaved: fn(),
    registerPurchaseAction: fn(async (): Promise<StockActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof StockEntryDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Las 4 stories dejan el diálogo abierto por diseño (el cierre es
 * caller-controlled: `open={product !== null}`). En batch, el portal de la
 * story anterior puede seguir montado un frame y `findByRole('dialog')`
 * matchea múltiple → tomar SIEMPRE el último (el de esta story).
 */
async function findCurrentDialog(body: ReturnType<typeof within>) {
  const dialogs = await body.findAllByRole('dialog')
  return dialogs[dialogs.length - 1]!
}

/** Packs × unidades por pack: la preview muestra el total y la action recibe `units` ya multiplicado. */
export const Reposicion: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await findCurrentDialog(body)
    const dialog = within(dialogEl)

    await userEvent.clear(dialog.getByLabelText('Packs'))
    await userEvent.type(dialog.getByLabelText('Packs'), '4')
    await userEvent.clear(dialog.getByLabelText('Unidades por pack'))
    await userEvent.type(dialog.getByLabelText('Unidades por pack'), '6')
    await expect(dialog.getByText('= 24 unidades')).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: /registrar reposición/i }))
    await waitFor(() =>
      expect(args.registerPurchaseAction).toHaveBeenCalledWith(
        expect.objectContaining({ productId: PRODUCT.id, units: 24 }),
      ),
    )
    // El cierre real lo controla el caller (`open={product !== null}`); en el
    // sandbox onClose es un fn() mudo, así que el diálogo nunca se desmonta —
    // assertamos que el componente PIDIÓ cerrar (mismo gap documentado en
    // PagaloDeLaCaja más abajo).
    await waitFor(() => expect(args.onClose).toHaveBeenCalled())
  },
}

/** Con costo por unidad se ofrece el toggle para actualizar el costo del producto. */
export const ConCostoPorUnidad: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))
    await userEvent.type(dialog.getByLabelText('Costo por unidad (pesos, opcional)'), '900')
    await expect(dialog.getByText('Actualizar costo del producto')).toBeVisible()
  },
}

/**
 * "Pagalo de la caja" (migr. 050): con costo > 0 cargado aparece el checkbox;
 * al tildarlo, chips de método (Efectivo default) + copy de ayuda con el
 * monto total. El submit manda `expense: { method }` en el payload.
 */
export const PagaloDeLaCaja: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await findCurrentDialog(body)
    const dialog = within(dialogEl)

    await userEvent.clear(dialog.getByLabelText('Packs'))
    await userEvent.type(dialog.getByLabelText('Packs'), '2')
    await userEvent.clear(dialog.getByLabelText('Unidades por pack'))
    await userEvent.type(dialog.getByLabelText('Unidades por pack'), '6')
    await userEvent.type(dialog.getByLabelText('Costo por unidad (pesos, opcional)'), '800')

    const checkbox = dialog.getByRole('checkbox', { name: /pagalo de la caja/i })
    await expect(checkbox).toBeVisible()
    await userEvent.click(checkbox)

    // 12 unidades × $800 = $9.600.
    await expect(dialog.getByText(/registra el gasto de.*9\.600/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(dialog.getByRole('button', { name: 'Transferencia' }))

    await userEvent.click(dialog.getByRole('button', { name: /registrar reposición/i }))
    await waitFor(() =>
      expect(args.registerPurchaseAction).toHaveBeenCalledWith(
        expect.objectContaining({
          units: 12,
          unitCost: 80000,
          expense: { method: 'transfer' },
        }),
      ),
    )
    // Sin waitForElementToBeRemoved acá a propósito: en el sandbox de Storybook
    // `onClose` es un fn() mudo que no realimenta `args.product` a null, así
    // que `open={product !== null}` nunca pasa a false — el diálogo real SÍ
    // cierra en la app (product pasa a null en el caller), pero esta story no
    // lo puede simular sin un wrapper controlado (ver ControlledModal en
    // RegisterMovementModal.stories.tsx). Mismo gap preexistente que ya tiene
    // "Reposicion" más arriba — no es parte de migr. 050.
  },
}

/** Borrar el costo destilda y oculta "Pagalo de la caja" — sin expense fantasma. */
export const BorrarCostoDestildaPagaloDeLaCaja: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await findCurrentDialog(body))

    const costInput = dialog.getByLabelText('Costo por unidad (pesos, opcional)')
    await userEvent.type(costInput, '800')
    await userEvent.click(dialog.getByRole('checkbox', { name: /pagalo de la caja/i }))
    await expect(dialog.getByRole('button', { name: 'Efectivo' })).toBeVisible()

    await userEvent.clear(costInput)
    await expect(dialog.queryByRole('checkbox', { name: /pagalo de la caja/i })).toBeNull()
    await expect(dialog.queryByRole('button', { name: 'Efectivo' })).toBeNull()
  },
}
