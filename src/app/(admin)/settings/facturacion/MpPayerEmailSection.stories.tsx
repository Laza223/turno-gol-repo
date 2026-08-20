import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { MpPayerEmailSection } from './MpPayerEmailSection'

/**
 * Migr. 078: con qué cuenta de MercadoPago paga el complejo la suscripción,
 * desacoplado del email de login. La action entra por prop — importarla como
 * valor arrastra drizzle/postgres al bundle (mismo motivo que
 * TenantContactForm).
 */
const meta = {
  title: 'Settings/Facturacion/MpPayerEmailSection',
  component: MpPayerEmailSection,
  parameters: { layout: 'padded' },
  args: {
    currentEmail: null,
    ownerEmail: 'dueño@complejo.test',
  },
} satisfies Meta<typeof MpPayerEmailSection>

export default meta
type Story = StoryObj<typeof meta>

/** El caso de todos los complejos existentes: nada declarado, se cobra al de login. */
export const SinDeclarar: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Los paréntesis distinguen la aclaración del email vigente del texto de
    // ayuda del campo, que dice casi lo mismo.
    await expect(canvas.getByText(/\(el email de tu cuenta de TurnoGol\)/i)).toBeInTheDocument()
    await expect(canvas.getByLabelText(/email de tu cuenta de MercadoPago/i)).toHaveValue('')
  },
}

/** Con un email de MercadoPago propio: es ESE el que se muestra como vigente. */
export const ConEmailDeclarado: Story = {
  args: {
    currentEmail: 'lajugadora@gmail.com',
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/email de tu cuenta de MercadoPago/i)).toHaveValue(
      'lajugadora@gmail.com',
    )
    await expect(
      canvas.queryByText(/\(el email de tu cuenta de TurnoGol\)/i),
    ).not.toBeInTheDocument()
  },
}

export const Guardado: Story = {
  args: {
    action: fn(async () => ({ success: true as const, email: 'cuenta.mp@gmail.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/Guardado\./i)).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /^guardar$/i }))
    await expect(await canvas.findByText(/Guardado\./i)).toBeInTheDocument()
    // Muestra lo GUARDADO (devuelto por la action), no lo que había al montar.
    await expect(await canvas.findByText('cuenta.mp@gmail.com')).toBeInTheDocument()
  },
}

/** Vaciar el campo es una acción válida: vuelve a cobrarse al email de login. */
export const Limpiado: Story = {
  args: {
    currentEmail: 'cuenta.mp@gmail.com',
    action: fn(async () => ({ success: true as const, email: null })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^guardar$/i }))
    await expect(
      await canvas.findByText(/volvemos a cobrarte al email de tu cuenta de TurnoGol/i),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/\(el email de tu cuenta de TurnoGol\)/i)).toBeInTheDocument()
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Ingresá un email válido' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^guardar$/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ingresá un email válido')
  },
}

const guardando = pendingAction({ success: true as const })

export const Guardando: Story = {
  args: { action: fn(guardando.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const submit = canvas.getByRole('button', { name: /^guardar$/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
    // Última story del archivo a propósito: una action en vuelo sin liberar
    // contamina las siguientes (ver el comentario de pending-action.ts).
    await guardando.release(submit)
  },
}
