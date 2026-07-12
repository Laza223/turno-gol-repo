import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ImpersonateButton } from './impersonate-button'

/**
 * "Entrar como este complejo". La action entra por prop (ver el comentario en
 * impersonate-button.tsx) — '../actions' es `'use server'` y arrastra
 * node:async_hooks si se importa como valor.
 *
 * En éxito `action` redirige del lado del servidor y esta promesa nunca
 * resuelve dentro del browser — por eso solo hay estados idle/pending/error
 * observables acá (el caso éxito no tiene un estado visual propio, la story
 * de error lo cubre indirectamente con el mismo flujo de confirm+click).
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/ImpersonateButton',
  component: ImpersonateButton,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    tenantName: 'Complejo Fénix',
  },
} satisfies Meta<typeof ImpersonateButton>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

/** Confirma el window.confirm y dispara la action — que nunca "vuelve" en éxito real. */
export const ConfirmaYEntra: Story = {
  args: { action: fn(async () => new Promise<never>(() => {})) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const originalConfirm = window.confirm
    window.confirm = () => true
    try {
      await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
      await expect(await canvas.findByRole('button', { name: /entrando…/i })).toBeDisabled()
    } finally {
      window.confirm = originalConfirm
    }
  },
}

/** Cancela el window.confirm: no dispara la action, el botón sigue idle. */
export const CancelaLaConfirmacion: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const originalConfirm = window.confirm
    window.confirm = () => false
    try {
      await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
      await expect(args.action).not.toHaveBeenCalled()
    } finally {
      window.confirm = originalConfirm
    }
  },
}

/** El complejo no tiene admin activo para delegar la impersonación: error inline. */
export const SinAdminActivo: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'El complejo no tiene un administrador activo: no se puede impersonar.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const originalConfirm = window.confirm
    window.confirm = () => true
    try {
      await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
      await expect(await canvas.findByText(/no tiene un administrador activo/i)).toBeInTheDocument()
    } finally {
      window.confirm = originalConfirm
    }
  },
}
