import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ResetForm, type ResetPasswordAction } from './reset-form'

type ResetState = Awaited<ReturnType<ResetPasswordAction>>

/**
 * La Server Action entra por prop (ver el comentario en reset-form.tsx). El
 * contenedor reproduce la card `card-premium`-like de reset-password/page.tsx
 * (border + bg-card + backdrop-blur), superficie donde el form vive de verdad.
 */
const meta = {
  title: 'Auth/ResetPasswordForm',
  component: ResetForm,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[420px] items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/4 dark:border-white/8 backdrop-blur-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ResetForm>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
}

export const PasswordVisible: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const password = canvas.getByLabelText('Nueva contraseña') as HTMLInputElement
    await expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(canvas.getByRole('button', { name: 'Mostrar contraseña' }))
    await expect(password).toHaveAttribute('type', 'text')
    // El toggle único controla los dos campos (misma `show`).
    await expect(canvas.getByLabelText('Repetir contraseña')).toHaveAttribute('type', 'text')
  },
}

export const Error: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      message: 'Las contraseñas no coinciden.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar contraseña' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.')
  },
}

export const Guardando: Story = {
  args: {
    action: fn((): Promise<ResetState> => new Promise(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nueva contraseña'), 'unapassword123')
    await userEvent.type(canvas.getByLabelText('Repetir contraseña'), 'unapassword123')
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar contraseña' }))
    await expect(await canvas.findByText('Guardando…')).toBeInTheDocument()
  },
}
