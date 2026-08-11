import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { PlayerTagsCard } from './PlayerTagsCard'

const PLAYER_ID = uid(561)

const meta = {
  title: 'Admin/Jugadores/PlayerTagsCard',
  component: PlayerTagsCard,
  parameters: { layout: 'padded' },
  args: {
    playerId: PLAYER_ID,
    tags: [],
    setPlayerTagsAction: fn(async () => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="content-area-gradient min-h-screen w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerTagsCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Sin etiquetas: el botón arranca deshabilitado porque no hay nada que guardar.
 * Las 5 opciones se ven siempre — el set es cerrado, no hay "agregar otra".
 */
export const SinEtiquetas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(5)
    await expect(canvas.getByRole('button', { name: 'Guardar etiquetas' })).toBeDisabled()
    // La ausencia de un campo de texto libre no es un detalle de diseño: es la
    // decisión D3. Si aparece un textarea acá, se reabrió D3 sin querer.
    await expect(canvas.queryByRole('textbox')).toBeNull()
  },
}

/** Con etiquetas ya puestas: los checkboxes llegan marcados desde el servidor. */
export const ConEtiquetas: Story = {
  args: { tags: ['gets_credit', 'group_organizer'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: /se le fía/i })).toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: /organiza el grupo/i })).toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: /no fiar/i })).not.toBeChecked()
  },
}

/** Marcar una etiqueta habilita el guardado y manda el set completo, no un delta. */
export const MarcarYGuardar: Story = {
  args: { tags: ['gets_credit'] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const save = canvas.getByRole('button', { name: 'Guardar etiquetas' })
    await expect(save).toBeDisabled()

    await userEvent.click(canvas.getByRole('checkbox', { name: /organiza el grupo/i }))
    await expect(canvas.getByText('Hay cambios sin guardar.')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Guardar etiquetas' }))
    await waitFor(() =>
      expect(args.setPlayerTagsAction).toHaveBeenCalledWith(PLAYER_ID, [
        'gets_credit',
        'group_organizer',
      ]),
    )
  },
}

/**
 * Si el servidor rechaza, los checkboxes vuelven a lo último confirmado: dejarlos
 * marcados haría creer que la etiqueta quedó puesta cuando no se guardó nada.
 */
export const ElServidorRechaza: Story = {
  args: {
    tags: ['gets_credit'],
    setPlayerTagsAction: fn(async () => ({
      success: false,
      error: 'No se puede marcar "Se le fía" y "No fiar" a la vez.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('checkbox', { name: /no fiar/i }))
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar etiquetas' }))

    await waitFor(() =>
      expect(canvas.getByRole('checkbox', { name: /no fiar/i })).not.toBeChecked(),
    )
    await expect(canvas.getByRole('checkbox', { name: /se le fía/i })).toBeChecked()
  },
}
