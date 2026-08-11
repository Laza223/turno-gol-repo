import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { LoginCard, type LoginAction, type ResendConfirmationAction } from './LoginCard'

type LoginState = Awaited<ReturnType<LoginAction>>
type ResendState = Awaited<ReturnType<ResendConfirmationAction>>

/**
 * Las 2 Server Actions (login + reenvío de confirmación) entran por PROP (ver
 * el comentario en LoginCard.tsx). El contenedor reproduce el `max-w-md` de
 * /login (page.tsx), superficie clara con `bg-card`.
 */
const meta = {
  title: 'Auth/LoginCard',
  component: LoginCard,
  parameters: { layout: 'padded' },
  args: {
    resendAction: fn(async (): Promise<ResendState> => ({ status: 'idle' })),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-[520px] items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12">
        <div className="w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof LoginCard>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { loginAction: fn(async () => ({ status: 'idle' as const })) },
}

export const CredencialesInvalidas: Story = {
  args: {
    loginAction: fn(async () => ({
      status: 'error' as const,
      message: 'Email o contraseña incorrectos.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ingresar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Email o contraseña incorrectos.',
    )
    // Sin unconfirmedEmail: no aparece el link de reenvío.
    await expect(canvas.queryByText(/reenviar email/i)).not.toBeInTheDocument()
  },
}

/** Email sin confirmar: aparece el link de reenvío de confirmación (2do useFormState anidado). */
export const EmailSinConfirmar: Story = {
  args: {
    loginAction: fn(async () => ({
      status: 'error' as const,
      message: 'Tenés que confirmar tu email antes de entrar.',
      unconfirmedEmail: 'nuevo@complejo.com',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ingresar' }))
    await expect(
      await canvas.findByText('Tenés que confirmar tu email antes de entrar.'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: /reenviar email de confirmación/i }),
    ).toBeInTheDocument()
  },
}

/** Reenvío exitoso: el link de reenvío se reemplaza por el mensaje de confirmación. */
export const ReenvioOk: Story = {
  args: {
    loginAction: fn(async () => ({
      status: 'error' as const,
      message: 'Tenés que confirmar tu email antes de entrar.',
      unconfirmedEmail: 'nuevo@complejo.com',
    })),
    resendAction: fn(async (): Promise<ResendState> => ({ status: 'sent' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ingresar' }))
    await userEvent.click(
      await canvas.findByRole('button', { name: /reenviar email de confirmación/i }),
    )
    await expect(
      await canvas.findByText('Te reenviamos el email de confirmación. Revisá tu bandeja.'),
    ).toBeInTheDocument()
  },
}

export const PasswordVisible: Story = {
  args: { loginAction: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const password = canvas.getByLabelText('Contraseña') as HTMLInputElement
    await expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(canvas.getByRole('button', { name: 'Mostrar contraseña' }))
    await expect(password).toHaveAttribute('type', 'text')
  },
}

const ingresando = pendingAction<LoginState>({ status: 'idle' })

export const Ingresando: Story = {
  args: {
    loginAction: fn(ingresando.action),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'marcelo@complejo.com')
    await userEvent.type(canvas.getByLabelText('Contraseña'), 'unapassword123')
    const submit = canvas.getByRole('button', { name: 'Ingresar' })
    await userEvent.click(submit)
    await expect(await canvas.findByText('Ingresando…')).toBeInTheDocument()
    // Liberar la transición: una promesa que nunca resuelve queda colgada en el
    // scheduler de React y contamina la story siguiente del archivo.
    await ingresando.release(submit)
  },
}
