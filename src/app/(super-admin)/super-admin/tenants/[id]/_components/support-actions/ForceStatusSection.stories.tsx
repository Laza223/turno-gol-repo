import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Feedback, RunAction, SupportAction } from './constants'
import { ForceStatusSection } from './ForceStatusSection'

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

/** Los 2 destinos destructivos del FSM (support.schema.ts DESTRUCTIVE_TARGET_STATUSES). */
const DESTRUCTIVE_TARGETS = ['blocked', 'deleted'] as const

const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/ForceStatusSection',
  component: ForceStatusSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    tenantName: 'Complejo Fénix',
    status: 'active',
    forceableTargets: ['past_due'],
    destructiveTargets: [...DESTRUCTIVE_TARGETS],
    pending: false,
    run: fakeRun(),
    action: okAction("Estado forzado: 'active' → 'past_due'."),
  },
} satisfies Meta<typeof ForceStatusSection>

export default meta
type Story = StoryObj<typeof meta>

/** `deleted` no tiene transiciones forzables salientes (FORCEABLE_TRANSITIONS.deleted = []). */
export const SinTransicionesForzables: Story = {
  args: { status: 'deleted', forceableTargets: [] },
}

/** Destino no destructivo (blocked→active): el botón se habilita sin pedir confirmación. */
export const DestinoNoDestructivo: Story = {
  args: {
    status: 'blocked',
    forceableTargets: ['active', 'churned'],
    action: okAction("Estado forzado: 'blocked' → 'active'."),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Estado destino'), 'active')
    await expect(canvas.queryByLabelText(/escribí el nombre exacto/i)).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Forzar estado' }))
    await expect(await canvas.findByText(/'blocked' → 'active'/)).toBeInTheDocument()
  },
}

/**
 * Destino destructivo (blocked): exige tipear el nombre exacto antes de
 * habilitar el botón. `deleted` YA NO es forzable desde ningún origen
 * (FORCEABLE_TRANSITIONS lo excluye — el borrado real es exclusivo del cron
 * de retención), así que el ejemplo de destino destructivo real es
 * suspended→blocked, no blocked→deleted.
 */
export const DestinoDestructivoExigeConfirmacion: Story = {
  args: {
    status: 'suspended',
    forceableTargets: ['active', 'blocked'],
    action: okAction("Estado forzado: 'suspended' → 'blocked'."),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Estado destino'), 'blocked')
    const btn = canvas.getByRole('button', { name: 'Forzar estado' })
    await expect(btn).toBeDisabled()

    await userEvent.type(canvas.getByLabelText(/escribí el nombre exacto/i), 'Complejo Fénix')
    await expect(btn).toBeEnabled()
    await userEvent.click(btn)
    await expect(await canvas.findByText(/'suspended' → 'blocked'/)).toBeInTheDocument()
  },
}

export const TransicionInvalida: Story = {
  args: {
    action: errorAction(
      "Transición inválida según el ciclo de vida: de 'active' a 'past_due'. Puede deberse a una ventana temporal del FSM (dunning/retención) todavía no cumplida.",
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Estado destino'), 'past_due')
    await userEvent.click(canvas.getByRole('button', { name: 'Forzar estado' }))
    await expect(await canvas.findByText(/transición inválida/i)).toBeInTheDocument()
  },
}
