import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/**
 * @radix-ui/react-popover puro, portaled con collision detection. Base de
 * Combobox/DatePicker/PhoneInput — acá se muestra tal cual (Trigger+Content)
 * porque esos tres ya tienen su propia story con su composición real.
 */
const meta = {
  title: 'Design System/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

function Content() {
  return (
    <p className="text-sm text-muted-foreground">
      El complejo puede cambiar el porcentaje de seña en cualquier momento desde Configuración.
    </p>
  )
}

export const Cerrado: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">¿Qué es la seña?</Button>
      </PopoverTrigger>
      <PopoverContent>
        <Content />
      </PopoverContent>
    </Popover>
  ),
}

/** `defaultOpen` (Radix, sin estado controlado) para mostrar el panel directamente. */
export const AbiertoAlineadoInicio: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">¿Qué es la seña?</Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Content />
      </PopoverContent>
    </Popover>
  ),
}

export const AbiertoAlineadoFin: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">¿Qué es la seña?</Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <Content />
      </PopoverContent>
    </Popover>
  ),
}

export const AbrirPorClick: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">¿Qué es la seña?</Button>
      </PopoverTrigger>
      <PopoverContent>
        <Content />
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '¿Qué es la seña?' }))

    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByText(/porcentaje de seña/i)).toBeVisible()
  },
}
