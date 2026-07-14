import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/**
 * @radix-ui/react-popover puro, portaled con collision detection. Base de
 * Combobox/DatePicker/PhoneInput — acá se muestra tal cual (Trigger+Content)
 * porque esos tres ya tienen su propia story con su composición real.
 *
 * `PopoverContent` rinde `role="dialog"`: sin nombre accesible axe lo marca
 * (aria-dialog-name). Los 3 usos reales sueltos del Popover crudo
 * (BookingCard, AccountMenu, AdminThemeMenu) siempre pasan `aria-label`; acá
 * se reproduce lo mismo.
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
      <PopoverContent aria-label="¿Qué es la seña?">
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
      <PopoverContent align="start" aria-label="¿Qué es la seña?">
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
      <PopoverContent align="end" aria-label="¿Qué es la seña?">
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
      <PopoverContent aria-label="¿Qué es la seña?">
        <Content />
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '¿Qué es la seña?' }))

    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick y toBeVisible() lo agarra en falso negativo.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByText(/porcentaje de seña/i)).toBeVisible())
  },
}
