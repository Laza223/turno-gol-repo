import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { tournament } from '@/test/fixtures'
import { CancelarTorneo } from './CancelarTorneo'
import type { TournamentActionResult } from '../actions'

/**
 * El contenido de un diálogo recién abierto se afirma dentro de `waitFor`.
 * `findByRole('dialog')` resuelve apenas monta, pero Radix todavía está en el
 * primer frame de su animación de entrada (opacity 0), así que un `toBeVisible`
 * inmediato es una carrera: pasa en una máquina rápida y pierde en los 2 cores
 * del runner de CI. Mismo patrón que `BorrarTorneo.stories.tsx`.
 */
async function expectVisible(el: () => HTMLElement) {
  await waitFor(() => expect(el()).toBeVisible())
}

const meta = {
  title: 'Admin/Torneos/CancelarTorneo',
  component: CancelarTorneo,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    tournamentName: tournament().name,
    canCancel: true,
    cancelAction: fn(async (): Promise<TournamentActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof CancelarTorneo>

export default meta
type Story = StoryObj<typeof meta>

/** Dueño, torneo en curso: se puede cancelar, escribiendo el nombre. */
export const Disponible: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar torneo' }))

    const dialog = await within(document.body).findByRole('dialog')
    await expectVisible(() => within(dialog).getByText('No se puede deshacer.'))

    // Clase C: hasta que no se escribe el nombre, confirmar está bloqueado.
    const confirmar = within(dialog).getByRole('button', { name: 'Cancelar torneo' })
    await expect(confirmar).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText(/escribí/i), tournament().name)
    await expect(confirmar).toBeEnabled()
    await expect(args.cancelAction).not.toHaveBeenCalled()

    await userEvent.click(confirmar)
    await waitFor(() =>
      expect(args.cancelAction).toHaveBeenCalledWith({
        id: tournament().id,
        status: 'canceled',
      }),
    )
  },
}

/**
 * Encargado: bloqueado con candado y tooltip, NUNCA escondido (MASTER §12
 * CHK-admin) — mismo patrón que `CorteZonasCard.tsx`.
 */
export const BloqueadoPorRol: Story = {
  args: { canCancel: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancelar torneo')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Cancelar torneo' })).toBeNull()
    const locked = canvas.getByText('Cancelar torneo').closest('span')
    await expect(locked).toHaveAttribute('title', 'Solo el dueño puede cancelar torneos')
  },
}

/** El servidor tiene bloqueos que esta pantalla no conoce. */
export const ErrorDelServidor: Story = {
  args: {
    cancelAction: fn(async (): Promise<TournamentActionResult> => ({
      success: false,
      error: 'Ese torneo ya no existe.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar torneo' }))

    const dialog = await within(document.body).findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/escribí/i), tournament().name)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar torneo' }))

    await expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya no existe/i)
  },
}
