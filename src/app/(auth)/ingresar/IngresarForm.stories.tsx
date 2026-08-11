import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { IngresarForm, type PlayerLoginAction } from './IngresarForm'

type PlayerLoginState = Awaited<ReturnType<PlayerLoginAction>>

/**
 * La Server Action entra por prop (ver el comentario en IngresarForm.tsx).
 * El contenedor reproduce el fondo `#020617` + `max-w-md` de /ingresar
 * (page.tsx): la card es "glass dark premium", pensada para vivir sobre ese
 * fondo — sobre `bg-background` claro el texto blanco perdería contraste.
 */
const meta = {
  title: 'Auth/IngresarForm',
  component: IngresarForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/ingresar' } },
  },
  decorators: [
    (Story) => (
      <div
        className="flex min-h-[560px] items-center justify-center px-4 py-12"
        style={{ background: '#020617' }}
      >
        <div className="w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof IngresarForm>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
}

/** ?deleted=1: aviso de cuenta eliminada (DeleteAccountForm → /ingresar?deleted=1). */
export const CuentaEliminada: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/ingresar', query: { deleted: '1' } } },
  },
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tu cuenta fue eliminada')).toBeInTheDocument()
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
    await userEvent.click(canvas.getByRole('button', { name: 'Enviarme el enlace' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ingresá un email válido.')
  },
}

const enviando = pendingAction<PlayerLoginState>({ status: 'idle' })

export const Enviando: Story = {
  args: {
    // Se libera al final del play: una promesa que nunca resuelve deja viva una
    // transición de React que le rompe las stories siguientes (pending-action.ts).
    action: fn(enviando.action),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/email/i), 'tomas@example.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Enviarme el enlace' }))
    await expect(await canvas.findByText('Enviando…')).toBeInTheDocument()
    await enviando.release(canvas.getByRole('button'))
  },
}

/** state.status === 'sent': muestra el email al que se mandó el link. */
export const Enviado: Story = {
  args: {
    action: fn(async () => ({ status: 'sent' as const, email: 'tomas.ibanez@example.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Enviarme el enlace' }))
    await expect(await canvas.findByText('Revisá tu email')).toBeInTheDocument()
    await expect(canvas.getByText('tomas.ibanez@example.com')).toBeInTheDocument()
  },
}
