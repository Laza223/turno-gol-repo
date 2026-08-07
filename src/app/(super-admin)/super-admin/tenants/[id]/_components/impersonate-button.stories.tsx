import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
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
  // En la app real siempre vive dentro del <Card title="Soporte"> de
  // detail-primitives.tsx (bg-card blanco) — ver resumen-tab.tsx. Suelto sobre
  // bg-background el mensaje de error rojo mide 3.88:1 y falla axe; adentro del
  // card blanco mide 4.83:1 y pasa. El contenedor no es cosmético.
  decorators: [
    (Story) => (
      <section className="rounded-lg border border-border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold text-foreground">Soporte</h2>
        <div className="mt-4">
          <Story />
        </div>
      </section>
    ),
  ],
} satisfies Meta<typeof ImpersonateButton>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

/**
 * Confirma en el ConfirmDialog (reemplazó `window.confirm()` nativo, 🔴
 * auditoría 2026-08-01 §4.7/§8) y dispara la action — que nunca "vuelve" en
 * éxito real (redirige del lado del servidor).
 */
const confirmaYEntra = pendingAction({ success: true as const })

export const ConfirmaYEntra: Story = {
  args: { action: fn(confirmaYEntra.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('heading', { name: /entrar como "complejo fénix"/i })
    await userEvent.click(body.getByRole('button', { name: 'Entrar' }))
    await expect(await body.findByRole('button', { name: 'Procesando…' })).toBeDisabled()
    // ConfirmDialog corre `onConfirm` dentro de una transición: sin release
    // queda viva y contamina las 2 stories siguientes (ver pendingAction).
    // Se libera con success — el diálogo cierra, que es la evidencia del commit.
    await confirmaYEntra.release()
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

/** Cancela el diálogo: no dispara la action. */
export const CancelaLaConfirmacion: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Cancelar' }))
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** El complejo no tiene admin activo para delegar la impersonación: error inline en el diálogo. */
export const SinAdminActivo: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'El complejo no tiene un administrador activo: no se puede impersonar.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /entrar como este complejo/i }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Entrar' }))
    await expect(await body.findByText(/no tiene un administrador activo/i)).toBeInTheDocument()
  },
}
