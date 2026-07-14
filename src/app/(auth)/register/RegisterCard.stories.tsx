import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RegisterCard, type RegisterAction } from './RegisterCard'

type RegisterState = Awaited<ReturnType<RegisterAction>>

/**
 * La Server Action entra por prop (ver el comentario en RegisterCard.tsx). El
 * contenedor reproduce el `max-w-md` de /register (page.tsx).
 */
const meta = {
  title: 'Auth/RegisterCard',
  component: RegisterCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[520px] items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12">
        <div className="w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof RegisterCard>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
}

export const FieldErrors: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      fieldErrors: {
        email: 'Ingresá un email válido',
        password: 'La contraseña debe tener al menos 8 caracteres',
        confirmPassword: 'Las contraseñas no coinciden.',
      },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cuenta' }))
    await expect(await canvas.findByText('Ingresá un email válido')).toBeInTheDocument()
    await expect(canvas.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
  },
}

export const ErrorGeneral: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      fieldErrors: { _form: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cuenta' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/demasiados intentos/i)
  },
}

/** state.status === 'confirm': reemplaza la card entera por "Confirmá tu email". */
export const Confirmar: Story = {
  args: {
    action: fn(async () => ({ status: 'confirm' as const, email: 'marcelo@complejosanmartin.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cuenta' }))
    await expect(await canvas.findByText('Confirmá tu email')).toBeInTheDocument()
    await expect(canvas.getByText('marcelo@complejosanmartin.com')).toBeInTheDocument()
  },
}

/** state.status === 'existing': ya existe una cuenta con ese email → CTA a /login. */
export const CuentaExistente: Story = {
  args: {
    action: fn(async () => ({ status: 'existing' as const, email: 'marcelo@complejosanmartin.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cuenta' }))
    await expect(await canvas.findByText('Ya tenés una cuenta')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument()
  },
}

export const Creando: Story = {
  args: {
    action: fn((): Promise<RegisterState> => new Promise(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cuenta' }))
    await expect(await canvas.findByText('Creando…')).toBeInTheDocument()
  },
}
