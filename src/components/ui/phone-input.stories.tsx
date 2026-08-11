import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PhoneInput } from './phone-input'

/**
 * Autosuficiente en estilos (a diferencia de Combobox) — se usa suelto en
 * forms de perfil/registro (ProfileForm, StepIdentity). El `<input
 * type="hidden">` que arma el string internacional completo lo lee un
 * `<form action={...}>` real; acá no hace falta reproducirlo.
 */
const meta = {
  title: 'Design System/PhoneInput',
  component: PhoneInput,
  parameters: { layout: 'centered' },
  args: { label: 'Teléfono', name: 'phone' },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhoneInput>

export default meta
type Story = StoryObj<typeof meta>

/** Default: Argentina +54, sin número cargado. */
export const Default: Story = {}

export const ConValorParseado: Story = {
  args: { defaultValue: '+54 11 4567-8900' },
}

/** `+598...` se reconoce y cambia el país seleccionado automáticamente. */
export const ConValorDeOtroPais: Story = {
  args: { defaultValue: '+598 99 123 456' },
}

export const ConError: Story = {
  args: { defaultValue: '123', error: 'Ingresá un teléfono válido' },
}

export const ConHelper: Story = {
  args: { helper: 'Lo usamos solo para avisos de tu reserva.' },
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: '+54 11 4567-8900' },
}

export const Requerido: Story = {
  args: { required: true },
}

/** Click en el selector de país abre el popover con buscador y lista completa. */
export const SelectorDePaisAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Seleccionar código de país/ }))
    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick y toBeVisible() lo agarra en falso negativo.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('listbox')).toBeVisible())
    await expect(body.getByText('Argentina')).toBeVisible()
  },
}

/** Buscar filtra por nombre, código ISO o código de marcado. */
export const BusquedaSinResultados: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Seleccionar código de país/ }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.type(await body.findByLabelText('Buscar país o código'), 'zzzz')
    await waitFor(() => expect(body.getByText('No se encontraron países')).toBeVisible())
  },
}

/** Elegir un país en el popover lo marca con check y devuelve el foco al input de número. */
export const ElegirPais: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Seleccionar código de país/ }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByText('Uruguay'))
    await expect(canvas.getByRole('button', { name: /Uruguay \(\+598\)/ })).toBeVisible()
  },
}
