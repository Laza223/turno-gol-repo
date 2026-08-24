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
    // El caso real de casi todos los complejos: la columna existe desde la
    // migración 003 pero nunca hubo pantalla para cargarla, así que está en
    // NULL y los jugadores caen al teléfono de arriba.
    currentWhatsapp: null,
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

/**
 * Con WhatsApp propio cargado: es el canal que se le ofrece al jugador.
 *
 * Ojo con el valor que queda en el input: `parsePhoneNumber` BORRA el 9 de los
 * móviles argentinos al parsear, así que un `+54 9 11 5566-7788` guardado se
 * muestra —y se vuelve a guardar— como `11 5566-7788`, sin el marcador de
 * móvil. Por eso `toWhatsappDigits` normaliza al construir el link y nunca
 * confía en lo que está en la base. Este assert documenta ese comportamiento
 * real: si algún día el form deja de comerse el 9, esta story se pone roja y
 * hay que revisar la normalización.
 */
export const ConWhatsappPropio: Story = {
  args: {
    currentWhatsapp: '+54 9 11 5566-7788',
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/whatsapp/i)).toHaveValue('11 5566-7788')
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
