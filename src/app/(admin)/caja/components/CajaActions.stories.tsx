import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { CajaActions } from './CajaActions'

const meta = {
  title: 'Admin/Caja/CajaActions',
  component: CajaActions,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    totalIncome: 4500000,
    totalExpense: 800000,
    balance: 3700000,
    cashTotal: 2000000,
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
    await expect(await body.findByRole('dialog')).toBeVisible()
    await expect(body.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()
  },
}
