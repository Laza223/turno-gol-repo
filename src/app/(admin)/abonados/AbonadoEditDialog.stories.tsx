import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { abonado } from '@/test/fixtures'
import { AbonadoEditDialog } from './AbonadoEditDialog'

/**
 * Editar un turno fijo en todas sus fechas futuras. Las acciones llegan por
 * prop (ver AbonadosList.tsx). El diálogo arranca abierto: Radix lo porta a
 * `document.body`, de ahí el `within(body)`.
 */
const meta = {
  title: 'Admin/Abonados/AbonadoEditDialog',
  component: AbonadoEditDialog,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    onOpenChange: fn(),
    abonado: abonado({ contactName: 'Cachi', dayOfWeek: 2, timeStart: '21:00', timeEnd: '22:00' }),
    courts: [
      { id: 'court-1', name: 'Cancha 1' },
      { id: 'court-2', name: 'Cancha 2' },
    ],
    previewAction: fn(async () => ({
      success: true as const,
      preview: {
        futureSessions: 8,
        priceUpdated: 7,
        keptOwnPrice: 1,
        keptPaid: 0,
        moved: 0,
        notMoved: 0,
        conflictDates: [],
        fixedConflict: false,
      },
    })),
    updateAction: fn(async () => ({
      success: true as const,
      abonado: abonado(),
      counts: { futureSessions: 8, priceUpdated: 7, keptOwnPrice: 1, keptPaid: 0, moved: 0 },
    })),
  },
} satisfies Meta<typeof AbonadoEditDialog>

export default meta
type Story = StoryObj<typeof meta>

export const SinCambios: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(body.getByText('Editar el fijo de Cachi (martes 21:00)')).toBeVisible(),
    )
    await expect(body.getByText('No cambiaste nada.')).toBeVisible()
    await expect(body.getByRole('button', { name: 'Guardar en todas las fechas' })).toBeDisabled()
  },
}

export const ConFijoDeUnaCuenta: Story = {
  args: { abonado: abonado({ playerId: 'player-1', contactName: 'Cachi' }) },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(
        body.getByText(
          'Este fijo está a nombre de una cuenta. El nombre que ve el jugador sale de su cuenta.',
        ),
      ).toBeVisible(),
    )
  },
}
