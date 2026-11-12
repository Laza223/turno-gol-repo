import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PriceInput } from './PriceInput'
import { SignupFrame } from './SignupFrame'

function Controlled({ initial = null }: { initial?: number | null }) {
  const [cents, setCents] = useState<number | null>(initial)
  return (
    <div className="max-w-sm p-4">
      <PriceInput
        id="precio"
        label="Precio del turno de Fútbol 5"
        valueCents={cents}
        onChange={setCents}
      />
    </div>
  )
}

const meta = {
  title: 'Onboarding/PriceInput',
  component: PriceInput,
  parameters: { layout: 'fullscreen' },
  // Se usa siempre sobre el marco oscuro del alta.
  decorators: [
    (Story) => (
      <SignupFrame className="min-h-0 p-8">
        <Story />
      </SignupFrame>
    ),
  ],
  args: {
    id: 'precio',
    label: 'Precio del turno de Fútbol 5',
    valueCents: null,
    onChange: fn(),
  },
} satisfies Meta<typeof PriceInput>

export default meta
type Story = StoryObj<typeof meta>

/** El eco aparece mientras se tipea y usa el separador de miles. */
export const EcoEnVivo: Story = {
  render: () => <Controlled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox', { name: /precio del turno/i })
    await expect(input).toHaveAttribute('inputmode', 'numeric')
    await userEvent.type(input, '60000')
    await expect(canvas.getByText('Un turno de 60 minutos: $60.000')).toBeInTheDocument()
  },
}

/**
 * Bug conocido de MoneyInput: Backspace sobre el separador de miles leía "24.00"
 * como decimal. "84.000" con Backspace tiene que quedar $8.400, no $84.
 */
export const BackspaceNoCorrompeElMonto: Story = {
  render: () => <Controlled initial={8_400_000} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox', { name: /precio del turno/i })
    await userEvent.click(input)
    await userEvent.keyboard('{End}{Backspace}')
    await expect(canvas.getByText('Un turno de 60 minutos: $8.400')).toBeInTheDocument()
  },
}

/** Sin monto, el eco no dice nada. */
export const Vacio: Story = {
  render: () => <Controlled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/un turno de 60 minutos/i)).toBeNull()
  },
}
