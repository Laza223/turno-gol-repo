import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { planSummaries } from '@/test/fixtures/super-admin'
import type { Feedback, RunAction, SupportAction } from './constants'
import { ChangePlanSection } from './ChangePlanSection'

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

const plans = planSummaries()

const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/ChangePlanSection',
  component: ChangePlanSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    hasSubscription: true,
    currentPlanId: plans[0]!.id,
    plans,
    pending: false,
    run: fakeRun(),
    action: okAction('Plan cambiado sin cobro.'),
  },
} satisfies Meta<typeof ChangePlanSection>

export default meta
type Story = StoryObj<typeof meta>

/** Sin suscripción registrada: la sección no ofrece la acción. */
export const SinSuscripcion: Story = {
  args: { hasSubscription: false },
}

/** El plan actual (Predio) no aparece en el selector — solo se ofrecen destinos. */
export const SelectorSinElPlanActual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByLabelText('Plan destino')
    await expect(within(select).queryByText(/predio/i)).not.toBeInTheDocument()
    await expect(within(select).getByText(/complejo/i)).toBeInTheDocument()
    await expect(within(select).getByText(/estadio/i)).toBeInTheDocument()
  },
}

export const CambiadoOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Plan destino'), plans[2]!.id)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar plan' }))
    await expect(await canvas.findByText('Plan cambiado sin cobro.')).toBeInTheDocument()
  },
}

export const PlanInexistente: Story = {
  args: { action: errorAction('Plan destino inexistente o inactivo.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Plan destino'), plans[1]!.id)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar plan' }))
    await expect(await canvas.findByText(/inexistente o inactivo/i)).toBeInTheDocument()
  },
}
