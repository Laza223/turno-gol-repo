import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { canteenTabs } from '@/test/fixtures'
import { FiadosList } from './FiadosList'
import type { CancelTabActionResult, SettleTabActionResult } from './actions'

const TABS = canteenTabs()

const meta = {
  title: 'Admin/Caja/Cantina/FiadosList',
  component: FiadosList,
  parameters: { layout: 'padded' },
  args: {
    tabs: TABS,
    settleDisabled: false,
    settleTabAction: fn(
      async (): Promise<SettleTabActionResult> => ({ success: true, total: 450000 }),
    ),
    cancelTabAction: fn(async (): Promise<CancelTabActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof FiadosList>

export default meta
type Story = StoryObj<typeof meta>

export const ConFiados: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(TABS[0]!.debtorName)).toBeVisible()
    await expect(canvas.getByText(TABS[1]!.debtorName)).toBeVisible()
    // El segundo fiado tiene nota (canteenTabConNota).
    await expect(canvas.getByText(TABS[1]!.note!)).toBeVisible()
  },
}

export const SinFiados: Story = {
  args: { tabs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin fiados pendientes.')).toBeVisible()
  },
}

export const CobrarFiado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const tab = TABS[0]!

    await userEvent.click(canvas.getAllByRole('button', { name: 'Cobrar' })[0]!)
    const dialog = within(await body.findByRole('dialog'))
    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick y toBeVisible() lo agarra en falso negativo (mismo idiom
    // que dialog.stories.tsx).
    await waitFor(() => expect(dialog.getByText(`Cobrar fiado — ${tab.debtorName}`)).toBeVisible())

    // SplitPaymentFields (Fase 1, D2): el método es un <select>, no un chip.
    await userEvent.selectOptions(dialog.getByRole('combobox'), 'Transferencia')
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.settleTabAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: tab.id,
          charges: [{ amount: tab.totalAmount, method: 'transfer' }],
        }),
      ),
    )
    // El cobro OK cierra el diálogo (tab pasa a null), pero Radix anima la
    // salida (duration-200) antes de sacarlo del DOM. Sin esperar acá, el
    // portal queda a medio cerrar y contamina las stories siguientes del
    // archivo (rule del contrato: cerrar portales al final del play).
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

/** Caja cerrada: el cobro queda deshabilitado con hint, el diálogo se puede abrir igual. */
export const CobroDeshabilitadoPorCajaCerrada: Story = {
  args: { settleDisabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getAllByRole('button', { name: 'Cobrar' })[0]!)
    const dialog = within(await body.findByRole('dialog'))
    // waitFor: mismo fade-in-0 que en CobrarFiado.
    await waitFor(() => expect(dialog.getByText(/caja cerrada/i)).toBeVisible())
    await expect(dialog.getByRole('button', { name: /^Cobrar/ })).toBeDisabled()

    // Esta story no cobra ni cancela — el diálogo queda abierto por defecto y
    // contamina la story siguiente del archivo (Anular Fiado) si no se cierra acá.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

export const AnularFiado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const tab = TABS[0]!

    await userEvent.click(canvas.getAllByRole('button', { name: 'Anular' })[0]!)
    const dialog = within(await body.findByRole('dialog'))
    // waitFor: mismo fade-in-0 que en CobrarFiado.
    await waitFor(() => expect(dialog.getByText(`Anular fiado — ${tab.debtorName}`)).toBeVisible())

    // Motivo obligatorio: sin cargar nota, el submit no llama a la action.
    await userEvent.click(dialog.getByRole('button', { name: 'Confirmar anulación' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/por qué se anula/i)
    await expect(args.cancelTabAction).not.toHaveBeenCalled()

    await userEvent.type(dialog.getByLabelText('Motivo'), 'Se pagó en el momento')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirmar anulación' }))

    await waitFor(() =>
      expect(args.cancelTabAction).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: tab.id, reason: 'Se pagó en el momento' }),
      ),
    )
  },
}
