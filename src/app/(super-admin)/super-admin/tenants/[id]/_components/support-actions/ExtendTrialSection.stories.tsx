import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Feedback, RunAction, SupportAction } from './constants'
import { ExtendTrialSection } from './ExtendTrialSection'

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

const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/ExtendTrialSection',
  component: ExtendTrialSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    isTrialing: true,
    pending: false,
    run: fakeRun(),
    action: okAction('Trial extendido 7 días (vence 2026-03-21).'),
  },
} satisfies Meta<typeof ExtendTrialSection>

export default meta
type Story = StoryObj<typeof meta>

/** Tenant fuera de trial: no aplica. */
export const NoEstaEnTrial: Story = {
  args: { isTrialing: false },
}

export const ExtendidoOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/días/i)).toHaveValue(7)
    await userEvent.click(canvas.getByRole('button', { name: 'Extender trial' }))
    await expect(await canvas.findByText(/trial extendido 7 días/i)).toBeInTheDocument()
  },
}

export const TenantNoEstaEnTrialEnElServidor: Story = {
  args: {
    action: errorAction(
      "Solo se puede extender el trial de un complejo en estado 'trialing' (actual: 'active').",
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Extender trial' }))
    await expect(await canvas.findByText(/actual: 'active'/i)).toBeInTheDocument()
  },
}
