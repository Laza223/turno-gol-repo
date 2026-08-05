import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { canteenProduct } from '@/test/fixtures'
import { StockExitDialog } from './StockExitDialog'
import type { StockActionResult } from './actions'

const PRODUCT = canteenProduct()

const meta = {
  title: 'Admin/Caja/Productos/StockExitDialog',
  component: StockExitDialog,
  parameters: { layout: 'padded' },
  args: {
    product: PRODUCT,
    onClose: fn(),
    onSaved: fn(),
    registerStockExitAction: fn(async (): Promise<StockActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof StockExitDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Motivo (chip) + cantidad + nota obligatoria. Copy explícito: no toca la caja. */
export const SalidaPorMerma: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)

    await expect(dialog.getByText('Esto no toca la caja: solo descuenta stock.')).toBeVisible()
    await userEvent.type(dialog.getByLabelText('Nota'), 'latas vencidas')
    await userEvent.click(dialog.getByRole('button', { name: /registrar salida/i }))

    await waitFor(() =>
      expect(args.registerStockExitAction).toHaveBeenCalledWith(
        expect.objectContaining({ productId: PRODUCT.id, reason: 'waste', note: 'latas vencidas' }),
      ),
    )
    // El cierre real lo controla el caller (`open={product !== null}`); en el
    // sandbox onClose es un fn() mudo que no realimenta `args.product` a null,
    // así que el diálogo nunca se desmonta — mismo gap documentado en
    // StockEntryDialog.stories.tsx (Reposicion/PagaloDeLaCaja): assertamos
    // que el componente PIDIÓ cerrar, no que el DOM lo haya sacado.
    await waitFor(() => expect(args.onClose).toHaveBeenCalled())
  },
}

/** Sin nota: el motivo es obligatorio, el error inline bloquea el envío. */
export const ErrorSinNota: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: /registrar salida/i }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/contá el motivo/i)
    await expect(args.registerStockExitAction).not.toHaveBeenCalled()
  },
}
