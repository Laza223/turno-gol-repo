import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { EmptyMovementAction } from './EmptyMovementAction'

const meta = {
  title: 'Admin/Caja/EmptyMovementAction',
  component: EmptyMovementAction,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    createCashFlowAction: fn(async () => ({
      success: false as const,
      error: 'no usado en esta story',
    })),
  },
} satisfies Meta<typeof EmptyMovementAction>

export default meta
type Story = StoryObj<typeof meta>

/** Botón del EmptyState "Sin movimientos por ahora" (caja/page.tsx). */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Registrar el primer movimiento' })).toBeVisible()
  },
}

/** Click abre el mismo RegisterMovementModal (code-split) que usa CajaActions. */
export const AbreModal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Registrar el primer movimiento' }))
    // RegisterMovementModal entra por next/dynamic: timeout largo, mismo motivo
    // que CajaActions.stories.tsx (AbrirModalDeMovimiento).
    const dialog = await body.findByRole('dialog', {}, { timeout: 15_000 })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(body.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()
  },
}
