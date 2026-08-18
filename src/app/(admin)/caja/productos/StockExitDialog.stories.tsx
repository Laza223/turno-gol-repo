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

/**
 * Las 2 stories dejan el diálogo abierto por diseño (el cierre es
 * caller-controlled: `open={product !== null}`). En batch, el portal de la
 * story anterior puede seguir montado un frame y `findByRole('dialog')`
 * matchea múltiple → tomar SIEMPRE el último (el de esta story). Mismo helper
 * que StockEntryDialog.stories.tsx / ProductFormDialog.stories.tsx.
 */
async function findCurrentDialog(body: ReturnType<typeof within>) {
  const dialogs = await body.findAllByRole('dialog')
  return dialogs[dialogs.length - 1]!
}

/** Motivo (chip) + cantidad + nota obligatoria. Copy explícito: no toca la caja. */
export const SalidaPorMerma: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogEl = await findCurrentDialog(body)
    const dialog = within(dialogEl)

    // `findByRole` resuelve apenas el nodo EXISTE, no cuando está visible: el
    // diálogo entra con `data-[state=open]:animate-in fade-in-0` y el primer
    // frame llega en opacity 0, así que un `getByText(...).toBeVisible()`
    // síncrono le gana la carrera en CI (rojo en el run 32175436851, verde al
    // re-correr el mismo commit). `waitFor` sobre el `textContent` del
    // contenedor estable relee el DOM vivo en cada reintento y no captura el
    // nodo. OJO con el log: `toBeVisible` serializa el elemento con
    // `cloneNode(false)`, o sea SIEMPRE sin hijos — leerlo como "el texto
    // nunca llegó" manda a buscar un bug de producto que no existe.
    await waitFor(() =>
      expect(dialogEl.textContent).toContain('Esto no toca la caja: solo descuenta stock.'),
    )
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
    const dialog = within(await findCurrentDialog(body))
    await userEvent.click(dialog.getByRole('button', { name: /registrar salida/i }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/contá el motivo/i)
    await expect(args.registerStockExitAction).not.toHaveBeenCalled()
  },
}
