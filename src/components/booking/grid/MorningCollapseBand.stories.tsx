import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MorningCollapseBand } from './MorningCollapseBand'

/**
 * Banda de madrugada colapsada (pages/grilla.md §5): es hija directa del CSS
 * Grid de GridScroller (`style={{ gridColumn: '1 / -1', gridRow: 2 }}`), así
 * que fuera de ese contenedor el posicionamiento absoluto/relativo de la fila
 * no se ve — se reproduce el `display:grid` mínimo para que ocupe su fila
 * como en la grilla real.
 */
const meta = {
  title: 'Booking/Grid/MorningCollapseBand',
  component: MorningCollapseBand,
  parameters: { layout: 'padded' },
  args: {
    firstSlot: '00:00',
    boundarySlot: '08:00',
    onExpand: fn(),
  },
  decorators: [
    (Story) => (
      <div className="grid w-full max-w-2xl" style={{ gridTemplateRows: '2.75rem' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MorningCollapseBand>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const RangoCorto: Story = {
  name: 'Rango corto (2hs colapsadas, el mínimo colapsable)',
  args: { firstSlot: '06:00', boundarySlot: '08:00' },
}

export const Expandir: Story = {
  name: 'Click dispara onExpand',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', {
      name: 'Mostrar horarios sin actividad de 00:00 a 08:00',
    })
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    await expect(args.onExpand).toHaveBeenCalledOnce()
  },
}
