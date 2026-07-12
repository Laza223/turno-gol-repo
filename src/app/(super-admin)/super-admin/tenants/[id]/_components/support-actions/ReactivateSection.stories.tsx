import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Feedback, RunAction, SupportAction } from './constants'
import { ReactivateSection } from './ReactivateSection'

function fakeRun(): RunAction {
  return (fn2, setFeedback: (f: Feedback) => void) => {
    void fn2().then((res) =>
      setFeedback(res.success ? { kind: 'ok', text: res.message ?? 'Acción ejecutada.' } : { kind: 'error', text: res.error }),
    )
  }
}

/**
 * El return type se anota explícito a `Promise<ActionResult>`: sin esto,
 * `fn()` infiere el literal del PRIMER mock (p. ej. `{success:true}`) y
 * cualquier story que lo pise con `{success:false}` deja de tipar — `action`
 * queda pinneado a ese shape en vez de al `SupportAction` genérico del prop.
 */
type ActionResult = Awaited<ReturnType<SupportAction>>
const okAction = (message: string) => fn(async (): Promise<ActionResult> => ({ success: true, message }))
const errorAction = (error: string) => fn(async (): Promise<ActionResult> => ({ success: false, error }))

/**
 * Solo se monta cuando `canReactivate` es true en el panel (subscription !=
 * null y el estado actual está en REACTIVATABLE_STATUSES) — acá se asume ya
 * satisfecho, es la responsabilidad de `SupportActionsPanel`.
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/ReactivateSection',
  component: ReactivateSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    pending: false,
    run: fakeRun(),
    action: okAction("Complejo reactivado (estaba 'suspended')."),
  },
} satisfies Meta<typeof ReactivateSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ReactivadoOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reactivar' }))
    await expect(await canvas.findByText(/reactivado \(estaba 'suspended'\)/i)).toBeInTheDocument()
  },
}

export const SinSuscripcion: Story = {
  args: { action: errorAction('El complejo no tiene suscripción registrada.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reactivar' }))
    await expect(await canvas.findByText(/no tiene suscripción registrada/i)).toBeInTheDocument()
  },
}

/** Deshabilitado mientras corre cualquier otra acción del panel compartido (`pending`). */
export const Pendiente: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Reactivar' })).toBeDisabled()
  },
}
