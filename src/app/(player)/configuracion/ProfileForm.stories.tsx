import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { player } from '@/test/fixtures/player'
import { ProfileForm } from './ProfileForm'

const base = player()
const defaultValues = {
  firstName: base.firstName,
  lastName: base.lastName,
  phone: base.phone ?? '',
  preferredArea: 'Palermo',
}

/**
 * La Server Action entra por prop (ver el comentario en ProfileForm.tsx). El formulario vive en
 * la tarjeta de "Tus datos" de Mi cuenta.
 */
const meta = {
  title: 'Player/Configuracion/ProfileForm',
  component: ProfileForm,
  parameters: { layout: 'padded' },
  args: { defaultValues },
  decorators: [
    (Story) => (
      <div className="max-w-[35rem] bg-card p-5 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Nombre')).toHaveValue(base.firstName)
    // El email no se edita: no hay campo.
    await expect(canvas.queryByDisplayValue(base.email)).not.toBeInTheDocument()
    // Sin mensaje antes de guardar.
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
  },
}

/** Los campos del portal: 44 px de alto y borde `input`, 16 px en el celular. */
export const CamposDe44Px: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const campo of [
      canvas.getByLabelText('Nombre'),
      canvas.getByLabelText(/Apellido/),
      canvas.getByLabelText('Zona preferida'),
      canvas.getByRole('button', { name: 'Guardar cambios' }),
    ]) {
      await expect(campo.getBoundingClientRect().height).toBeGreaterThanOrEqual(40)
    }
  },
}

/** Apellido opcional: se guarda con el campo vacío (como en la reserva). */
export const ApellidoVacioSeGuarda: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.clear(canvas.getByLabelText(/Apellido/))
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = formDataOf(args.action)
    await expect(formData.get('last_name')).toBe('')
    await expect(await canvas.findByText('Guardado')).toBeInTheDocument()
  },
}

function formDataOf(action: unknown): FormData {
  const calls = (action as { mock: { calls: unknown[][] } }).mock.calls
  return calls[0]![1] as FormData
}

/** El error de un campo va pegado a ese campo, que queda marcado, y no debajo del botón. */
export const ErrorAlLadoDelCampo: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'Nombre requerido',
      field: 'first_name' as const,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.clear(canvas.getByLabelText('Nombre'))
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    const alerta = await canvas.findByRole('alert')
    await expect(alerta).toHaveTextContent('Nombre requerido')
    const campo = canvas.getByLabelText('Nombre')
    await expect(campo).toHaveAttribute('aria-invalid', 'true')
    await expect(campo.getAttribute('aria-describedby')).toBe(alerta.id)
    // Lo que escribió (acá, nada) no se pisa: el form no se resetea al fallar.
    await expect(campo).toHaveValue('')
  },
}

/** Un error que no es de un campo (la base, el perfil) va una vez, debajo del botón. */
export const ErrorGeneral: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'No encontramos tu perfil.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No encontramos tu perfil.')
    await expect(canvas.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid')
  },
}

export const GuardadoOk: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent('Guardado')
  },
}

/** "Guardado" deja de decir algo cierto en cuanto se vuelve a editar: desaparece. */
export const GuardadoSeVaAlEditar: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByText('Guardado')).toBeInTheDocument()
    await userEvent.type(canvas.getByLabelText('Zona preferida'), ' Norte')
    await waitFor(() => expect(canvas.queryByText('Guardado')).not.toBeInTheDocument())
  },
}
