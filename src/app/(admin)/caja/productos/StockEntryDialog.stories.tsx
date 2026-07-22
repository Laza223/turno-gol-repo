import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
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

/** Packs × unidades por pack: la preview muestra el total y la action recibe `units` ya multiplicado. */
export const Reposicion: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await body.findByRole('dialog')
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
    await waitForElementToBeRemoved(dialogEl)
  },
}

/** Con costo por unidad se ofrece el toggle para actualizar el costo del producto. */
export const ConCostoPorUnidad: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Costo por unidad (pesos, opcional)'), '900')
    await expect(dialog.getByText('Actualizar costo del producto')).toBeVisible()
  },
}
