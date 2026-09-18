import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'
import { billedCourtsPricing } from '@/test/fixtures/super-admin'
import type { Feedback, RunAction, SupportAction } from './constants'
import { BilledCourtsSection } from './BilledCourtsSection'

function fakeRun(): RunAction {
  return (fn2, setFeedback: (f: Feedback) => void) => {
    void fn2().then((res) =>
      setFeedback(
        res.success
          ? { kind: 'ok', text: res.message ?? 'Acción ejecutada.' }
          : { kind: 'error', text: res.error },
      ),
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
const okAction = (message: string) =>
  fn(async (): Promise<ActionResult> => ({ success: true, message }))
const errorAction = (error: string) =>
  fn(async (): Promise<ActionResult> => ({ success: false, error }))

const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/BilledCourtsSection',
  component: BilledCourtsSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    currentBilledCourts: 5,
    billingCycle: 'monthly',
    onlineCourts: 4,
    pricing: billedCourtsPricing(),
    pending: false,
    run: fakeRun(),
    action: okAction('Canchas facturadas corregidas, sin cobro.'),
  },
} satisfies Meta<typeof BilledCourtsSection>

export default meta
type Story = StoryObj<typeof meta>

/** 5 canchas mensuales = $167.000/mes, visible antes de tocar nada. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Canchas facturadas')).toHaveValue(5)
    await expect(canvas.getByText(/167\.000/)).toBeInTheDocument()
    // Sin cambio no hay nada que confirmar.
    await expect(canvas.getByRole('button', { name: 'Corregir canchas' })).toBeDisabled()
  },
}

/** Sin suscripción registrada: la sección no ofrece la acción. */
export const SinSuscripcion: Story = {
  args: { currentBilledCourts: null, billingCycle: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/no tiene suscripción registrada/i)).toBeInTheDocument()
  },
}

/** Plan legacy sin precio por cancha: no se inventa un monto, se avisa. */
export const SinPrecioPorCancha: Story = {
  args: { pricing: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/sin precio por cancha cargado/i)).toBeInTheDocument()
  },
}

/** El monto nuevo aparece antes de confirmar, y el diálogo dice viejo → nuevo. */
export const MuestraElMontoNuevo: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // fireEvent.change y no userEvent.type: el input es controlado y numérico,
    // tipear deja el cursor donde React lo reposiciona y el valor sale mezclado.
    const input = canvas.getByLabelText('Canchas facturadas')
    await fireEvent.change(input, { target: { value: '6' } })
    // 6 canchas = 4.700.000 + 5 × 3.000.000 = 19.700.000 centavos.
    await expect(canvas.getByText(/197\.000/)).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Corregir canchas' }))
    await expect(args.action).not.toHaveBeenCalled()

    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByText(/de 5 canchas .*167\.000.* a 6 canchas .*197\.000/i),
    ).toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: 'Confirmar cambio' }))
    await expect(
      await canvas.findByText('Canchas facturadas corregidas, sin cobro.'),
    ).toBeInTheDocument()
  },
}

/** No se puede facturar por menos canchas de las que están prendidas. */
export const PorDebajoDeLasOnline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Canchas facturadas')
    await fireEvent.change(input, { target: { value: '3' } })
    await expect(canvas.getByText(/no se puede facturar por menos de 4/i)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Corregir canchas' })).toBeDisabled()
  },
}

/** El server igual rechaza (carrera con una cancha que se prendió recién). */
export const RechazadoPorElServer: Story = {
  args: {
    action: errorAction(
      'El complejo tiene 6 canchas online: no se puede facturar por 5. Desactivá canchas antes de bajar la cuota.',
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Canchas facturadas')
    await fireEvent.change(input, { target: { value: '7' } })
    await userEvent.click(canvas.getByRole('button', { name: 'Corregir canchas' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Confirmar cambio' }))
    await expect(await canvas.findByText(/no se puede facturar por 5/i)).toBeInTheDocument()
  },
}
