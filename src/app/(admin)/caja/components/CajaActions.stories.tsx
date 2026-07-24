import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { CajaActions } from './CajaActions'

const meta = {
  title: 'Admin/Caja/CajaActions',
  component: CajaActions,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    cutoffMins: 0,
    totalIncome: 4500000,
    totalExpense: 800000,
    balance: 3700000,
    cashTotal: 2000000,
    expectedCash: 3700000,
    openingCash: null,
    isClosed: false,
    createCashFlowAction: fn(async () => ({
      success: false as const,
      error: 'no usado en esta story',
    })),
    closeDayAction: fn(async () => ({ success: false as const, error: 'no usado en esta story' })),
  },
} satisfies Meta<typeof CajaActions>

export default meta
type Story = StoryObj<typeof meta>

export const Abierta: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '+ Agregar movimiento' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Cerrar caja' })).toBeVisible()
  },
}

/** Con la caja cerrada no hay acciones: el componente retorna null. */
export const Cerrada: Story = {
  args: { isClosed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: '+ Agregar movimiento' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Cerrar caja' })).not.toBeInTheDocument()
  },
}

/** "+ Agregar movimiento" carga (code-split) y abre RegisterMovementModal. */
export const AbrirModalDeMovimiento: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar movimiento' }))
    // RegisterMovementModal entra por next/dynamic: timeout largo para no
    // flakear bajo carga (batería completa de stories).
    const dialog = await body.findByRole('dialog', {}, { timeout: 15_000 })
    // Radix anima la entrada (fade-in ~200ms): toBeVisible() puede pescar el
    // frame con opacity todavía en 0 si se chequea apenas se encuentra el nodo.
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(body.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()
  },
}
