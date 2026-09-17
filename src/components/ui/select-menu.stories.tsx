import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { SelectMenu, type SelectMenuOption } from './select-menu'

/**
 * Reemplazo del `<select>` nativo en "Editar cancha" (CourtForm/PricingSection):
 * mismo `DropdownMenu` de Radix que el campo "Hora" de SearchBar, con
 * `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` (`menuitemradio` + `aria-checked`).
 */
const OPTIONS: SelectMenuOption[] = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
]

function ControlledSelectMenu(props: Partial<ComponentProps<typeof SelectMenu>>) {
  const [value, setValue] = useState(props.value ?? '')
  return (
    <div className="w-64">
      <label
        htmlFor="demo-select-menu"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Superficie
      </label>
      {/* {...props} va ANTES de value/onChange: si el `value` fijo del story se
          spreadeara último, pisaría el estado interno en cada render y ninguna
          interacción podría cambiarlo (mismo gotcha de ControlledCombobox). */}
      <SelectMenu
        {...props}
        id="demo-select-menu"
        options={OPTIONS}
        placeholder="Elegir superficie"
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

const meta = {
  title: 'Design System/SelectMenu',
  component: SelectMenu,
  parameters: { layout: 'centered' },
  // Cada story usa `render` con su propio wrapper controlado y no lee `args`;
  // este default solo satisface el tipo (todas las props son requeridas).
  args: {
    id: 'demo-select-menu',
    value: '',
    onChange: () => {},
    options: OPTIONS,
  },
} satisfies Meta<typeof SelectMenu>

export default meta
type Story = StoryObj<typeof meta>

export const SinValor: Story = {
  render: () => <ControlledSelectMenu />,
}

export const ConValorSeleccionado: Story = {
  render: () => <ControlledSelectMenu value="natural_grass" />,
}

/** Abre el menú, elige una opción y confirma trigger + `aria-checked` + hidden input. */
export const ElegirOpcion: Story = {
  render: () => <ControlledSelectMenu name="surfaceType" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Superficie'))

    // El panel (DropdownMenuContent) va portaled a document.body, fuera de canvasElement.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('menu')).toBeVisible())
    await userEvent.click(await body.findByRole('menuitemradio', { name: 'Cemento' }))

    await expect(canvas.getByText('Cemento')).toBeVisible()
    const hiddenInput = canvasElement.querySelector('input[name="surfaceType"]')
    await expect(hiddenInput).toHaveValue('cement')

    // Reabrir: la opción elegida tiene que quedar marcada.
    await userEvent.click(canvas.getByLabelText('Superficie'))
    await waitFor(() => expect(body.getByRole('menu')).toBeVisible())
    await expect(body.getByRole('menuitemradio', { name: 'Cemento' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

/** Dejado ABIERTO a propósito (mismo criterio que dropdown-menu.stories.tsx): el
 *  scan de axe corre después del play y tiene que ver el estado abierto. */
export const Abierto: Story = {
  render: () => <ControlledSelectMenu value="cement" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Superficie'))
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('menu')).toBeVisible())
  },
}
