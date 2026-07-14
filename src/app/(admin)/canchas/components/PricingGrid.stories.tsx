import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { openingHours, pricingSynthetic } from '@/test/fixtures'
import { expandRulesToGrid, type PriceGrid } from '@/modules/courts/pricing-grid'
import { PricingGrid } from './PricingGrid'

const HOURS = openingHours()
const GRID = expandRulesToGrid(pricingSynthetic().rules, HOURS)

// Wrapper controlado: PricingGrid es "grid/onGridChange" puro (spec §3.3), así
// que la story necesita dueño de estado para que la edición se vea reflejada
// — igual que PricingSection en la app real.
function ControlledPricingGrid({ initial }: { initial: PriceGrid }) {
  const [grid, setGrid] = useState(initial)
  return <PricingGrid openingHours={HOURS} grid={grid} onGridChange={setGrid} />
}

const meta = {
  title: 'Admin/Canchas/PricingGrid',
  component: PricingGrid,
  parameters: { layout: 'padded' },
  args: { openingHours: HOURS, grid: GRID, onGridChange: () => {} },
} satisfies Meta<typeof PricingGrid>

export default meta
type Story = StoryObj<typeof meta>

/** Heat map de la semana completa: más caro de noche y el fin de semana. */
export const HeatMapSemanaCompleta: Story = {}

export const SinHorasOperativas: Story = {
  args: {
    openingHours: {
      mon: { open: '00:00', close: '00:00', closed: true },
      tue: { open: '00:00', close: '00:00', closed: true },
      wed: { open: '00:00', close: '00:00', closed: true },
      thu: { open: '00:00', close: '00:00', closed: true },
      fri: { open: '00:00', close: '00:00', closed: true },
      sat: { open: '00:00', close: '00:00', closed: true },
      sun: { open: '00:00', close: '00:00', closed: true },
    },
    grid: {} as PriceGrid,
  },
  play: async ({ canvasElement }) => {
    // Sin horas operativas el componente retorna null: nada que renderizar.
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Seleccionar bloque' })).not.toBeInTheDocument()
  },
}

/** Editar una celda con un click: el precio nuevo queda reflejado en la matriz. */
export const EditarCeldaInline: Story = {
  render: () => <ControlledPricingGrid initial={GRID} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = canvas.getByRole('button', { name: /Lun 09:00/i })
    await userEvent.click(cell)

    const input = canvas.getByLabelText('Precio Lun 09:00')
    await userEvent.clear(input)
    await userEvent.type(input, '9500{Enter}')

    // formatArs (Intl es-AR) separa "$" del monto con un NBSP, no un espacio
    // normal: la accessible name (aria-label) no la normaliza getByRole, así
    // que hace falta \s (que sí matchea NBSP) en vez de un espacio literal.
    await expect(canvas.getByRole('button', { name: /Lun 09:00 \$\s9\.500/i })).toBeVisible()
  },
}

/** "Seleccionar bloque" + asignar precio a varias celdas de un tirón. */
export const AsignacionMasiva: Story = {
  render: () => <ControlledPricingGrid initial={GRID} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Seleccionar bloque' }))
    await userEvent.click(canvas.getByRole('button', { name: /Sáb 10:00/i }))
    await userEvent.click(canvas.getByRole('button', { name: /Dom 10:00/i }))

    await expect(canvas.getByText('2 celdas')).toBeVisible()

    await userEvent.type(canvas.getByLabelText('Precio para las celdas seleccionadas'), '18000')
    await userEvent.click(canvas.getByRole('button', { name: 'Asignar precio' }))

    // \s en vez de espacio literal: el "$" de formatArs va separado por NBSP.
    await expect(canvas.getByRole('button', { name: /Sáb 10:00 \$\s18\.000/i })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Dom 10:00 \$\s18\.000/i })).toBeVisible()
  },
}
