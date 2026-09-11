import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { AddMovementButton } from './AddMovementButton'

const meta = {
  title: 'Admin/Caja/AddMovementButton',
  component: AddMovementButton,
  parameters: { layout: 'padded' },
  args: {
    label: 'Registrar el primer movimiento',
    date: artDateString(),
    cutoffMins: 0,
    createCashFlowAction: fn(async () => ({
      success: false as const,
      error: 'no usado en esta story',
    })),
  },
} satisfies Meta<typeof AddMovementButton>

export default meta
type Story = StoryObj<typeof meta>

/** Botón del EmptyState "Sin movimientos por ahora" en /caja. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Registrar el primer movimiento' }),
    ).toBeVisible()
  },
}

/** Click abre el RegisterMovementModal (code-split). */
export const AbreModal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Registrar el primer movimiento' }))
    // RegisterMovementModal entra por next/dynamic: timeout largo.
    const dialog = await body.findByRole('dialog', {}, { timeout: 15_000 })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(body.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()
  },
}

/** Header de /caja: mismo componente, otro label. */
export const HeaderAgregarMovimiento: Story = {
  args: { label: '+ Agregar movimiento' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '+ Agregar movimiento' })).toBeVisible()
  },
}
