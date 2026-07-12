import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ForgotPasswordCard, type ForgotPasswordAction } from './ForgotPasswordCard'

type ForgotState = Awaited<ReturnType<ForgotPasswordAction>>

/**
 * La Server Action entra por prop (ver el comentario en ForgotPasswordCard.tsx).
 * './actions' es `'use server'` y arrastra request-context → `node:async_hooks`,
 * que Vite externaliza en el browser y rompe la story si se importa como valor.
 *
 * El contenedor reproduce el `max-w-md` + `Logo` de la page real
 * (forgot-password/page.tsx): el gradiente de fondo entra por className en el
 * decorator porque ahí es donde vive `text-foreground`/`text-muted-foreground`
 * con el contraste correcto (mismo criterio que ReservasPolicyForm.stories.tsx).
 */
const meta = {
  title: 'Auth/ForgotPasswordCard',
  component: ForgotPasswordCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[520px] items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12">
        <div className="w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ForgotPasswordCard>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
}

export const Enviando: Story = {
  args: {
    // No resuelve nunca dentro del ciclo de vida de la story: deja el botón
    // en `pending` para poder ver el spinner de forma estable.
    action: fn((): Promise<ForgotState> => new Promise(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/email/i), 'vos@complejo.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar enlace' }))
    await expect(await canvas.findByText('Enviando…')).toBeInTheDocument()
    await expect(canvas.getByRole('button')).toBeDisabled()
  },
}

export const Error: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      message: 'Ingresá un email válido.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar enlace' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ingresá un email válido.')
  },
}

/** state.status === 'sent': la card entera cambia por el mensaje "Revisá tu email". */
export const Enviado: Story = {
  args: { action: fn(async () => ({ status: 'sent' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar enlace' }))
    await expect(await canvas.findByText('Revisá tu email')).toBeInTheDocument()
  },
}
