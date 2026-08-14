import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { tenantSettings } from '@/test/fixtures/tenant'
import { ReservasPolicyForm } from './ReservasPolicyForm'

/**
 * La Server Action entra por prop (ver el comentario en ReservasPolicyForm.tsx).
 * `sb.mock()` NO sirve acá: el automock igual tiene que cargar el módulo real para
 * enumerar sus exports, y './actions' es `'use server'` → arrastra request-context
 * → `node:async_hooks`, que Vite externaliza en el browser y hace explotar la story.
 */
const meta = {
  title: 'Admin/Settings/ReservasPolicyForm',
  component: ReservasPolicyForm,
  parameters: { layout: 'padded' },
  args: { s: tenantSettings() },
  decorators: [
    // El contenedor NO es decoración: reproduce el de la página real
    // (settings/reservas/page.tsx envuelve el form en `.card-premium`, superficie
    // blanca). Sobre `bg-background` (slate-200) los labels `text-muted-foreground/90`
    // caen a 4.08:1 y axe falla AA con razón — pero ese contexto no existe en la app.
    // Una story que no reproduce su contenedor miente sobre el contraste y sobre el
    // layout.
    (Story) => (
      <div className="card-premium max-w-2xl rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Políticas de Reserva</h2>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReservasPolicyForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

/** Complejo sin seña: el bloque de porcentaje ni siquiera se renderiza. */
export const SinSena: Story = {
  args: {
    s: tenantSettings({ requires_deposit: false }),
    action: fn(async () => ({ success: true as const })),
  },
}

/** Porcentaje fuera de los presets (30/50/100) → arranca en "Otro" con el input abierto. */
export const PorcentajePersonalizado: Story = {
  args: {
    s: tenantSettings({ deposit_percentage: 45 }),
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/porcentaje de seña/i)).toHaveValue(45)
  },
}

/**
 * Candado de regresión (QA Lote 2 P1): con un preset activo (50%, plata real),
 * "Otro" tiene que precargar CON ESE VALOR — no con el "30" de estado inicial
 * de un form que nunca visitó "Otro". El bug real bajaba la seña en silencio.
 */
export const OtroPrecargaElPresetActivo: Story = {
  args: {
    s: tenantSettings({ deposit_percentage: 50 }),
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Hay dos botones "Otro" en la pantalla (seña y anticipación de
    // cancelación) — se escopea al fieldset "Seña" para no ambigüar.
    const senaFieldset = within(canvas.getByRole('group', { name: 'Seña' }))
    await userEvent.click(senaFieldset.getByRole('button', { name: 'Otro' }))
    await expect(canvas.getByLabelText(/porcentaje de seña/i)).toHaveValue(50)
  },
}

/** Reservas online apagadas: solo el complejo puede cargar turnos. */
export const ReservasOnlineDeshabilitadas: Story = {
  args: {
    s: tenantSettings({ allow_online_booking: false }),
    action: fn(async () => ({ success: true as const })),
  },
}

export const GuardadoOk: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent('Políticas guardadas.')
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'El porcentaje de seña debe estar entre 10 y 100.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/entre 10 y 100/i)
  },
}
