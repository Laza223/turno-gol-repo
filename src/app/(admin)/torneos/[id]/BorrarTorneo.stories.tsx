import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { tournamentDraft } from '@/test/fixtures'
import { BorrarTorneo } from './BorrarTorneo'
import type { TournamentActionResult } from '../actions'

/**
 * El contenido de un diálogo recién abierto se afirma dentro de `waitFor`.
 * `findByRole('dialog')` resuelve apenas monta, pero Radix todavía está en el
 * primer frame de su animación de entrada (opacity 0), así que un `toBeVisible`
 * inmediato es una carrera: pasa en una máquina rápida y pierde en los 2 cores
 * del runner de CI.
 */
async function expectVisible(el: () => HTMLElement) {
  await waitFor(() => expect(el()).toBeVisible())
}

const meta = {
  title: 'Admin/Torneos/BorrarTorneo',
  component: BorrarTorneo,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournamentDraft().id,
    tournamentName: tournamentDraft().name,
    teamCount: 3,
    slotCount: 0,
    deleteAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof BorrarTorneo>

export default meta
type Story = StoryObj<typeof meta>

/** Borrador sin horas tomadas: se puede borrar, escribiendo el nombre. */
export const Disponible: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /borrar este torneo/i }))

    const dialog = await within(document.body).findByRole('dialog')
    await expectVisible(() =>
      within(dialog).getByText('Se borran los 3 equipos anotados y sus planteles.'),
    )

    // Clase C: hasta que no se escribe el nombre, confirmar está bloqueado.
    const confirmar = within(dialog).getByRole('button', { name: 'Borrar torneo' })
    await expect(confirmar).toBeDisabled()

    await userEvent.type(
      within(dialog).getByLabelText(/escribí/i),
      tournamentDraft().name,
    )
    await expect(confirmar).toBeEnabled()
    await expect(args.deleteAction).not.toHaveBeenCalled()
  },
}

/** Con horas tomadas no se puede: se dice por qué, no se esconde el camino. */
export const BloqueadoPorHorasTomadas: Story = {
  args: { slotCount: 4 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/liberá primero las/i)).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /borrar este torneo/i })).toBeNull()
  },
}

/** Sin equipos anotados, la consecuencia sobre planteles no se inventa. */
export const SinEquipos: Story = {
  args: { teamCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /borrar este torneo/i }))
    const dialog = await within(document.body).findByRole('dialog')
    await expectVisible(() => within(dialog).getByText('No se puede deshacer.'))
    // Sin equipos anotados no se inventa una consecuencia sobre planteles.
    await expect(within(dialog).queryByText(/planteles/)).toBeNull()
  },
}

/** El servidor tiene bloqueos que esta pantalla no conoce (fixture, cobros). */
export const ErrorDelServidor: Story = {
  args: {
    deleteAction: fn(
      async (): Promise<TournamentActionResult> => ({
        success: false,
        error: 'El torneo ya tiene un fixture de 12 partidos. Borralo antes de eliminar el torneo.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /borrar este torneo/i }))

    const dialog = await within(document.body).findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(/escribí/i),
      tournamentDraft().name,
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar torneo' }))

    await expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /ya tiene un fixture/i,
    )
  },
}
