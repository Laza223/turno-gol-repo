import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { openingHours, pricingSynthetic } from '@/test/fixtures'
import { expandRulesToGrid, getOperativeHours, type PriceGrid } from '@/modules/courts/pricing-grid'
import { PricingGridTable } from './PricingGridTable'
import { cellKey } from './cell-utils'

const HOURS_ = openingHours()
const GRID = expandRulesToGrid(pricingSynthetic().rules, HOURS_)
const HOURS = getOperativeHours(HOURS_)

// Story-only: agujero de precio en lunes 10:00 (hora activa, sin regla) para
// mostrar el estado amber "sin precio" — la fixture sintética cubre 24hs.
const GRID_WITH_GAP: PriceGrid = {
  ...GRID,
  mon: Object.fromEntries(Object.entries(GRID.mon).filter(([hour]) => hour !== '10')) as Record<
    number,
    number
  >,
}

/** Sin wrapper especial: en PricingGrid vive suelto dentro de `<div className="space-y-3">`, sin card. */
const meta = {
  title: 'Admin/Canchas/PricingGridTable',
  component: PricingGridTable,
  parameters: { layout: 'padded' },
  args: {
    openingHours: HOURS_,
    grid: GRID,
    hours: HOURS,
    dayCount: 7,
    priceStats: { min: 900000, max: 1500000 },
    isDark: false,
    selected: new Set<string>(),
    editing: null,
    editValueCents: null,
    onEditValueChange: fn(),
    onCommit: fn(),
    onCancelEdit: fn(),
    onPointerDown: fn(),
    onPointerEnter: fn(),
    onCellClick: fn(),
  },
} satisfies Meta<typeof PricingGridTable>

export default meta
type Story = StoryObj<typeof meta>

/** Heat map claro→oscuro según precio; lunes 10:00 queda sin precio (amber). */
export const HeatMapConCeldasVacias: Story = {
  args: { grid: GRID_WITH_GAP },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lun 10:00 sin precio' })).toBeVisible()
  },
}

export const ClickEnCeldaAbreEditor: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = canvas.getByRole('button', { name: /Lun 09:00/i })
    await userEvent.click(cell)
    await expect(args.onCellClick).toHaveBeenCalledTimes(1)
  },
}

export const CeldaSeleccionada: Story = {
  args: {
    selected: new Set([cellKey('mon', 9)]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = canvas.getByRole('button', { name: /Lun 09:00/i })
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
  },
}

export const CeldaEnEdicion: Story = {
  args: {
    editing: cellKey('mon', 9),
    editValueCents: 900000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Precio Lun 09:00')).toHaveValue('9.000')
  },
}
