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
 *
 * Nada de `toBeVisible()` acá adentro, y no es cosmético: el DialogContent de
 * Radix entra con `animate-in fade-in-0`, o sea `opacity: 0` durante la
 * animación, y `toBeVisible` mira la opacidad. En un runner lento el assert
 * cae en el medio del fade y falla contra una UI que está perfectamente bien.
 * Se asserta PRESENCIA + TEXTO (`findBy*` + `toHaveTextContent`), que es el
 * patrón que ya usa `BanPlayerControls.stories.tsx` sobre este mismo diálogo.
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
    const body = within(document.body)
    const dialog = await body.findByRole('dialog')

    await expect(dialog).toHaveTextContent('Vincular a Diego del lunes')
    await expect(
      await within(dialog).findByRole('radio', { name: /Diego Rossi/ }),
    ).toBeChecked()
    // Estas dos frases llevan un <strong> adentro: quedan partidas en varios
    // nodos y `getByText` con string exacto no las encuentra nunca.
    await expect(dialog).toHaveTextContent('Coincide el teléfono con Diego Rossi')
    await expect(dialog).toHaveTextContent('Se vinculará con Diego Rossi.')
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

    const body = within(document.body)
    const dialog = await body.findByRole('dialog')
    const inDialog = within(dialog)

    await expect(dialog).toHaveTextContent('3 turnos fijos')
    await expect(dialog).not.toHaveTextContent('Coincide el teléfono')
    await expect(inDialog.queryByRole('radio')).not.toBeInTheDocument()

    await userEvent.click(inDialog.getByRole('button', { name: 'Vincular' }))

    // El error llega desde el `startTransition` async de ConfirmDialog: hay que
    // esperarlo, y hay que releer el nodo en cada intento — el que devuelve una
    // query previa puede quedar desmontado por el re-render de la transición.
    await waitFor(async () =>
      expect(await inDialog.findByRole('alert')).toHaveTextContent(
        'Elegí una cuenta para vincular.',
      ),
    )
    await expect(args.linkAction).not.toHaveBeenCalled()
  },
}
