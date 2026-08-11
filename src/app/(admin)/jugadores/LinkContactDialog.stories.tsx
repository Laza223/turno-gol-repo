import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { LinkContactDialog } from './LinkContactDialog'

const SUGGESTED_ID = uid(271)

/**
 * Diálogo de vinculación manual (B13). Las stories abren el diálogo en el
 * `play`: si se quedaran en el botón cerrado, el estado que importa —el que
 * muestra datos de una persona y dispara una escritura— nunca entraría al
 * árbol y axe no lo mediría nunca.
 */
const meta = {
  title: 'Admin/Jugadores/LinkContactDialog',
  component: LinkContactDialog,
  parameters: { layout: 'centered' },
  args: {
    contactKey: '1122334455',
    contactName: 'Diego del lunes',
    contactPhone: '011 15 2233-4455',
    fixedCount: 1,
    suggestedPlayerId: SUGGESTED_ID,
    suggestedPlayerName: 'Diego Rossi',
    searchAction: fn(async () => ({ success: true as const, candidates: [] })),
    linkAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof LinkContactDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Con sugerencia por teléfono: viene preseleccionada, pero igual hay que confirmar. */
export const ConSugerencia: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Vincular' }))

    // El diálogo va a un portal fuera del canvas.
    const dialog = within(document.body).getByRole('dialog')
    await expect(within(dialog).getByText('Vincular a Diego del lunes')).toBeVisible()
    await expect(within(dialog).getByRole('radio', { name: /Diego Rossi/ })).toBeChecked()
    // Las frases con <strong> adentro quedan partidas en varios nodos:
    // getByText no las encuentra, textContent sí. Con `waitFor` por el mismo
    // motivo que en `SinSugerencia`: el diálogo entra con animación.
    await waitFor(async () => {
      await expect(dialog.textContent).toContain('Se vinculará con Diego Rossi.')
      await expect(dialog.textContent).toContain('Coincide el teléfono con Diego Rossi')
    })
  },
}

/**
 * Sin coincidencia de teléfono: no hay nada preseleccionado y confirmar sin
 * elegir no puede escribir nada.
 */
export const SinSugerencia: Story = {
  args: {
    suggestedPlayerId: null,
    suggestedPlayerName: null,
    fixedCount: 3,
    linkAction: fn(async () => ({ success: true as const })),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Vincular' }))

    const dialog = within(document.body).getByRole('dialog')
    const inDialog = within(dialog)
    await waitFor(() => expect(dialog.textContent).toContain('3 turnos fijos'))
    await expect(inDialog.queryByRole('radio')).not.toBeInTheDocument()
    await expect(dialog.textContent).not.toContain('Coincide el teléfono')

    await userEvent.click(inDialog.getByRole('button', { name: 'Vincular' }))
    // `waitFor` sobre el contenedor y no `getByText(...).toBeVisible()`: el
    // error de ConfirmDialog llega desde un `startTransition` async, y en un
    // runner lento React vuelve a renderizar entre la query y la aserción — el
    // nodo que capturó `getByText` queda desmontado y vacío. Releer el
    // `textContent` del diálogo en cada reintento no tiene ese problema.
    await waitFor(() =>
      expect(dialog.textContent).toContain('Elegí una cuenta para vincular.'),
    )
    await expect(args.linkAction).not.toHaveBeenCalled()
  },
}
