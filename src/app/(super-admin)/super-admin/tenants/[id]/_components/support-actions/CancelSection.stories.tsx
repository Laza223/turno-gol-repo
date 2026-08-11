import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Feedback, RunAction, SupportAction } from './constants'
import { CancelSection } from './CancelSection'

/**
 * `run` orquesta la Server Action y vuelca el resultado en el feedback de la
 * sección (mismo contrato que `SupportActionsPanel`, reimplementado acá en
 * miniatura para poder storear `CancelSection` aislada de sus 6 hermanas).
 */
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
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/CancelSection',
  component: CancelSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    tenantName: 'Complejo Fénix',
    hasSubscription: true,
    pending: false,
    run: fakeRun(),
    action: okAction('Suscripción cancelada.'),
  },
} satisfies Meta<typeof CancelSection>

export default meta
type Story = StoryObj<typeof meta>

/** Sin suscripción registrada: la sección no ofrece la acción. */
export const SinSuscripcion: Story = {
  args: { hasSubscription: false },
}

/** El botón exige motivo ≥3 chars Y el nombre exacto del tenant — deshabilitado hasta cumplir ambos. */
export const ValidacionBloqueaElBoton: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btn = canvas.getByRole('button', { name: 'Cancelar suscripción' })
    await expect(btn).toBeDisabled()

    await userEvent.type(canvas.getByLabelText(/motivo/i), 'El complejo cerró.')
    await expect(btn).toBeDisabled()

    await userEvent.type(canvas.getByLabelText(/escribí el nombre exacto/i), 'Complejo Fénix')
    await expect(btn).toBeEnabled()
  },
}

export const CanceladaOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/motivo/i), 'El complejo cerró.')
    await userEvent.type(canvas.getByLabelText(/escribí el nombre exacto/i), 'Complejo Fénix')
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar suscripción' }))
    await expect(await canvas.findByText('Suscripción cancelada.')).toBeInTheDocument()
  },
}

/**
 * El cliente ya exige el nombre exacto antes de habilitar el botón — un
 * mismatch no llega ni a disparar la action (ver ValidacionBloqueaElBoton).
 * Esto cubre el rechazo del SERVIDOR con el nombre exacto tipeado (p. ej. la
 * suscripción se canceló en otra pestaña justo antes de este submit).
 */
export const ErrorDelServidor: Story = {
  args: { action: errorAction('El complejo no tiene suscripción registrada.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/motivo/i), 'El complejo cerró.')
    await userEvent.type(canvas.getByLabelText(/escribí el nombre exacto/i), 'Complejo Fénix')
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar suscripción' }))
    await expect(await canvas.findByText(/no tiene suscripción registrada/i)).toBeInTheDocument()
  },
}
