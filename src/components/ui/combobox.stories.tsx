import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MapPin } from 'lucide-react'
import Combobox, { type ComboboxOption } from './combobox'

/**
 * El propio `<input>` de Combobox NO trae estilos — solo aplica el
 * `inputClassName` que le pase el caller (`role="combobox"` desnudo). Su
 * único uso real (SearchBar.tsx / HeroSearch.tsx) lo compone con el mismo
 * `fieldClass` que usan los demás inputs del buscador público; se reproduce
 * ese mismo recipe acá para no mostrar un combobox "roto" sin borde.
 */
const FIELD_CLASS =
  'h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

const CITY_OPTIONS: ComboboxOption[] = [
  { value: 'caba', label: 'Ciudad Autónoma de Buenos Aires', hint: '48' },
  { value: 'cordoba', label: 'Córdoba', hint: '19' },
  { value: 'rosario', label: 'Rosario', hint: '14' },
  { value: 'mendoza', label: 'Mendoza', hint: '7' },
  { value: 'la-plata', label: 'La Plata', hint: '11' },
]

function ControlledCombobox(props: Partial<ComponentProps<typeof Combobox>>) {
  const [value, setValue] = useState(props.value ?? '')
  return (
    <div className="relative w-80">
      <MapPin
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {/* `{...props}` va PRIMERO, y `value`/`onChange` al final.
          Si el spread fuera último, un `value` fijo pasado por la story pisaría el
          estado interno en CADA render: los clicks se registrarían y el valor no
          cambiaría nunca. La story pasaría en verde sin probar nada. Es exactamente el
          bug que tenía ControlledDatePicker (ver date-picker.stories.tsx). */}
      <Combobox
        {...props}
        id="demo-combobox"
        options={CITY_OPTIONS}
        placeholder="Todas las ciudades"
        emptyMessage="No encontramos esa localidad"
        listboxLabel="Localidades"
        inputClassName={FIELD_CLASS}
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

const meta = {
  title: 'Design System/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' },
  // Cada story usa `render` con su propio wrapper controlado y no lee `args`;
  // este default solo satisface el tipo (todas las props de Combobox son
  // requeridas, así que TS exige un `args` completo aunque `render` lo ignore).
  args: {
    id: 'demo-combobox',
    options: CITY_OPTIONS,
    value: '',
    onChange: () => {},
  },
} satisfies Meta<typeof Combobox>

export default meta
type Story = StoryObj<typeof meta>

/** Cerrado, mostrando el label del value seleccionado. */
export const ConValorSeleccionado: Story = {
  render: () => <ControlledCombobox value="cordoba" />,
}

export const SinSeleccion: Story = {
  render: () => <ControlledCombobox />,
}

/** `clearOptionLabel`: agrega una primera opción "Todas" para volver al value vacío. */
export const ConOpcionDeLimpiar: Story = {
  render: () => <ControlledCombobox value="rosario" clearOptionLabel="Todas las ciudades" />,
}

/** Click en el input abre el listbox completo (índice inicial = opción ya seleccionada). */
export const AbrirListado: Story = {
  render: () => <ControlledCombobox value="mendoza" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox'))
    // El panel (PopoverContent) va portaled a document.body, fuera de canvasElement.
    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick y toBeVisible() lo agarra en falso negativo.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('listbox', { name: 'Localidades' })).toBeVisible())
    await expect(body.getByRole('option', { name: /Mendoza/ })).toHaveAttribute('aria-selected', 'true')
  },
}

/** Tipear filtra por texto, insensible a acentos ("cordoba" matchea "Córdoba"). */
export const Filtrando: Story = {
  render: () => <ControlledCombobox />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('combobox')
    await userEvent.type(input, 'cordoba')
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('option', { name: /Córdoba/ })).toBeVisible())
    await expect(body.queryByText('Rosario')).not.toBeInTheDocument()
  },
}

/** Sin coincidencias: se muestra `emptyMessage` dentro del listbox. */
export const SinResultados: Story = {
  render: () => <ControlledCombobox />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox'), 'Ushuaia')
    await expect(canvas.getByText('No encontramos esa localidad')).toBeVisible()
  },
}

/** Navegación por teclado: ArrowDown mueve `aria-activedescendant` a la siguiente opción. */
export const NavegacionPorTeclado: Story = {
  render: () => <ControlledCombobox />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('combobox')
    input.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(input).toHaveAttribute('aria-activedescendant', 'demo-combobox-option-0')
    await userEvent.keyboard('{ArrowDown}')
    await expect(input).toHaveAttribute('aria-activedescendant', 'demo-combobox-option-1')
    await userEvent.keyboard('{Enter}')
    await expect(input).toHaveAttribute('aria-expanded', 'false')
  },
}
