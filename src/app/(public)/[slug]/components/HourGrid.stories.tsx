import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import type { HourRow } from '@/lib/booking/hour-summary'
import HourGrid from './HourGrid'

const court = (id: string) => ({ id, name: `Cancha ${id}`, format: 5, price: null })

/** Las formas de una hora: varias libres, queda una, la única cancha libre, alguien señando y completa. */
const ROWS: HourRow[] = [
  { time: '18:00', freeCount: 3, state: 'free', courts: [court('1'), court('2'), court('3')] },
  { time: '19:00', freeCount: 0, state: 'full', courts: [] },
  { time: '20:00', freeCount: 1, state: 'last', courts: [court('1')] },
  { time: '21:00', freeCount: 0, state: 'held', courts: [] },
  { time: '22:00', freeCount: 5, state: 'free', courts: [court('1'), court('2')] },
  { time: '23:00', freeCount: 1, state: 'only', courts: [court('1')] },
  { time: '00:00', freeCount: 5, state: 'free', courts: [court('1'), court('2')] },
]

const meta = {
  title: 'Player/TenantProfile/HourGrid',
  component: HourGrid,
  parameters: { layout: 'fullscreen' },
  args: { rows: ROWS, value: null, onChange: () => {} },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="mx-auto max-w-sm bg-background p-4 text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof HourGrid>

export default meta
type Story = StoryObj<typeof meta>

/** Elegir una hora: relleno verde y tilde (nunca solo color), y las deshabilitadas no responden. */
export const Interactiva: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<string | null>(null)
    return <HourGrid {...args} value={value} onChange={setValue} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /^22:00/ }))
    await expect(canvas.getByRole('radio', { name: /^22:00/ })).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: /^19:00/ }))
    await expect(canvas.getByRole('radio', { name: /^22:00/ })).toBeChecked()
    await expect(canvas.getByRole('radio', { name: /^19:00/ })).toBeDisabled()
  },
}

export const Estados: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: /^18:00/ })).toHaveTextContent('3 libres')
    await expect(canvas.getByRole('radio', { name: /^19:00/ })).toHaveTextContent('Completo')
    await expect(canvas.getByRole('radio', { name: /^20:00/ })).toHaveTextContent('Queda 1')
    await expect(canvas.getByRole('radio', { name: /^23:00/ })).toHaveTextContent('Libre')
    const held = canvas.getByRole('radio', { name: /^21:00/ })
    await expect(held).toHaveTextContent('Señando')
    await expect(held).toBeDisabled()
    // La ayuda del "Señando" es texto visible, no un `title`.
    await expect(canvas.getByText(/alguien está pagando la seña/i)).toBeVisible()
  },
}

export const HoraElegida: Story = {
  args: { value: '20:00' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('radio', { name: /^20:00/ })).toBeChecked()
  },
}
