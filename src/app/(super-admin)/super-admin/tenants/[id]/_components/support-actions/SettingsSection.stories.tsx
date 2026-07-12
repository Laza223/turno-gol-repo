import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { supportPanelSettings } from '@/test/fixtures/super-admin'
import type { Feedback, RunAction, SupportAction } from './constants'
import { SettingsSection } from './SettingsSection'

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
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/SettingsSection',
  component: SettingsSection,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    settings: supportPanelSettings(),
    pending: false,
    run: fakeRun(),
    action: okAction('Settings actualizados.'),
  },
} satisfies Meta<typeof SettingsSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Complejo sin seña ni medios de pago electrónicos — solo efectivo. */
export const SoloEfectivo: Story = {
  args: {
    settings: supportPanelSettings({
      requires_deposit: false,
      accepts_transfer: false,
      accepts_mercadopago: false,
    }),
  },
}

export const GuardadoOk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Requiere seña'))
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar settings' }))
    await expect(await canvas.findByText('Settings actualizados.')).toBeInTheDocument()
  },
}

export const ErrorDelServidor: Story = {
  args: { action: errorAction('Datos inválidos: solo campos whitelisteados de settings.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar settings' }))
    await expect(await canvas.findByText(/campos whitelisteados/i)).toBeInTheDocument()
  },
}
