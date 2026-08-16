import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { TenantContactForm } from './TenantContactForm'

/**
 * B15 (plan de refactor de onboarding, Fase 4): el wizard dejó de pedir
 * teléfono/email del complejo — esta es la única pantalla donde se corrigen
 * después. La action entra por prop (`'use server'` arrastra drizzle/postgres
 * al bundle si se importa como valor — ver el comentario de ReservasPolicyForm).
 */
const meta = {
  title: 'Settings/Perfil/TenantContactForm',
  component: TenantContactForm,
  parameters: { layout: 'padded' },
  args: {
    currentPhone: '+54 11 2233-4455',
    currentEmail: 'contacto@complejo.test',
  },
} satisfies Meta<typeof TenantContactForm>

export default meta
type Story = StoryObj<typeof meta>

export const ConDatosGuardados: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/email/i)).toHaveValue('contacto@complejo.test')
  },
}

/** El mensaje de éxito espera al submit — no aparece solo por montar el form. */
export const Guardado: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Contacto guardado.')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /guardar contacto/i }))
    await expect(await canvas.findByText('Contacto guardado.')).toBeInTheDocument()
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'No pudimos guardar el contacto.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /guardar contacto/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar el contacto.',
    )
  },
}

const guardando = pendingAction({ success: true as const })

export const Guardando: Story = {
  args: { action: fn(guardando.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const submit = canvas.getByRole('button', { name: /guardar contacto/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
    // Última story del archivo: hoy es segura por posición, no por diseño.
    await guardando.release(submit)
  },
}
