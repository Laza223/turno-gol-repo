import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { stockLedger } from '@/test/fixtures'
import { StockLedgerList } from './StockLedgerList'

const meta = {
  title: 'Admin/Caja/Productos/StockLedgerList',
  component: StockLedgerList,
  parameters: { layout: 'padded' },
  args: {
    entries: stockLedger(),
  },
} satisfies Meta<typeof StockLedgerList>

export default meta
type Story = StoryObj<typeof meta>

/** Últimos movimientos: merma, venta y compra — con signo y tipo en español. */
export const ConMovimientos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Merma').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText('Venta').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText('Compra').length).toBeGreaterThan(0)
  },
}

export const SinMovimientos: Story = {
  args: { entries: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay movimientos de stock.')).toBeVisible()
  },
}
