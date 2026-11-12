import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { QuantityStepper } from './quantity-stepper'

function Controlled({ initial, min, max }: { initial: number; min?: number; max?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="p-4">
      <QuantityStepper
        label="canchas de Fútbol 5"
        value={value}
        onChange={setValue}
        min={min}
        max={max}
      />
    </div>
  )
}

const meta = {
  title: 'UI/QuantityStepper',
  component: QuantityStepper,
  parameters: { layout: 'centered' },
  args: { value: 0, onChange: fn(), label: 'canchas de Fútbol 5' },
} satisfies Meta<typeof QuantityStepper>

export default meta
type Story = StoryObj<typeof meta>

/** Suma y resta de a uno, y no baja del piso. */
export const SumarYRestar: Story = {
  render: () => <Controlled initial={1} min={0} max={3} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const menos = canvas.getByRole('button', { name: /menos/i })
    const mas = canvas.getByRole('button', { name: /más/i })

    await userEvent.click(mas)
    await expect(canvas.getByText('2')).toBeInTheDocument()

    await userEvent.click(menos)
    await userEvent.click(menos)
    await expect(canvas.getByText('0')).toBeInTheDocument()
    await expect(menos).toBeDisabled()
  },
}

/** En el techo, "más" se deshabilita. */
export const EnElTecho: Story = {
  render: () => <Controlled initial={3} min={0} max={3} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /más/i })).toBeDisabled()
  },
}
