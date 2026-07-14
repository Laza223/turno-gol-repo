import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Feedback, RunAction, SupportAction } from './constants'
import { ResetPasswordSection } from './ResetPasswordSection'

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
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/ResetPasswordSection',
  component: ResetPasswordSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    pending: false,
    run: fakeRun(),
    action: okAction('Contraseña temporal: TG-a1b2c3d4e5 — dictásela al titular. Deberá cambiarla al entrar.'),
  },
} satisfies Meta<typeof ResetPasswordSection>

export default meta
type Story = StoryObj<typeof meta>

/** Email vacío: el botón queda deshabilitado. */
export const EmailVacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Resetear contraseña' })).toBeDisabled()
  },
}

export const ReseteoOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email del staff'), 'rodrigo@complejofenix.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: 'Resetear contraseña' }))
    await expect(await canvas.findByText(/contraseña temporal: tg-/i)).toBeInTheDocument()
  },
}

/** El email no corresponde a un miembro activo del complejo. */
export const NoEsMiembroActivo: Story = {
  args: { action: errorAction('Ese email no es un miembro activo del complejo.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email del staff'), 'exempleado@complejofenix.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: 'Resetear contraseña' }))
    await expect(await canvas.findByText(/no es un miembro activo/i)).toBeInTheDocument()
  },
}
