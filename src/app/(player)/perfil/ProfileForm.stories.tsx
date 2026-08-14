import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { player } from '@/test/fixtures/player'
import { ProfileForm } from './ProfileForm'

const base = player()
const defaultValues = {
  firstName: base.firstName,
  lastName: base.lastName,
  phone: base.phone ?? '',
  preferredArea: 'Palermo',
  email: base.email,
}

/**
 * La Server Action entra por prop (ver el comentario en ProfileForm.tsx). El
 * contenedor reproduce la card `bg-card` de perfil/page.tsx donde vive de
 * verdad.
 */
const meta = {
  title: 'Player/Perfil/ProfileForm',
  component: ProfileForm,
  parameters: { layout: 'padded' },
  args: { defaultValues },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
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
    // El email es de solo lectura (no puede modificarse).
    await expect(canvas.getByText(base.email)).toBeInTheDocument()
  },
}

export const Error: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'No encontramos tu perfil.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No encontramos tu perfil.')
  },
}

/**
 * MEJORA-UX QA: antes, un Nombre vacío disparaba el tooltip nativo del
 * navegador y ni siquiera llamaba a la action — un mecanismo de error
 * distinto del resto del form. Con `noValidate`, pasa por el mismo
 * `role="alert"` que largo máximo/teléfono corto.
 */
export const NombreVacioPasaPorElMismoMecanismoDeError: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Nombre requerido' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.clear(canvas.getByLabelText('Nombre'))
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Nombre requerido')
  },
}

export const GuardadoOk: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent('Perfil actualizado')
  },
}
