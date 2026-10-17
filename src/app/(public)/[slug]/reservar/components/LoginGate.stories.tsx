import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { paintedContrast } from '@/test/contrast'
import { RESERVAR_COLUMN } from '../CheckoutStates'
import type { GateState } from '../actions'
import LoginGate from './LoginGate'

/**
 * Las actions entran por prop (mismo patrón que ConfirmBookingButton): '../actions' es
 * `'use server'` y arrastra `node:async_hooks` si se importa como valor. Va en la columna de
 * confirmar, dentro del mundo del portal; los tokens se resuelven en <html>, así que el contraste
 * se mide en los dos temas.
 */
const idle = async (): Promise<GateState> => ({ status: 'idle' })
const termsError = async (): Promise<GateState> => ({
  status: 'error',
  message: 'Tenés que aceptar los términos.',
  field: 'terms',
})
const sent = async (): Promise<GateState> => ({
  status: 'sent',
  email: 'tomas.ibanez@example.com',
  firstName: 'Tomás',
})

const meta = {
  title: 'Player/Checkout/LoginGate',
  component: LoginGate,
  parameters: { layout: 'fullscreen' },
  args: {
    next: '/complejo-fenix/reservar?court=101&date=2026-03-14&time=18:00&dur=60&formato=5&pay=cash',
    action: fn(idle),
    googleAction: fn(idle),
  },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <div className={RESERVAR_COLUMN}>
            <Story />
          </div>
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof LoginGate>

export default meta
type Story = StoryObj<typeof meta>

// Los botones en orden de DOM: es el orden en que los recorren el teclado y el lector de pantalla.
const buttonNames = (root: HTMLElement) =>
  within(root)
    .getAllByRole('button')
    .map((b) => b.textContent)

/** Primero la declaración del +18, después Google y el email del mismo peso. Nada deshabilitado. */
export const Reposo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(buttonNames(canvasElement)).toEqual([
      'Continuar con Google',
      'Continuar con mi email',
    ])
    await expect(canvas.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Continuar con mi email' })).toBeEnabled()
    await expect(canvas.getByLabelText('Nombre')).toBeRequired()
    await expect(canvas.getByLabelText('Email')).toBeRequired()
    await expect(canvas.queryByLabelText(/apellido/i)).not.toBeInTheDocument()
    await expect(canvas.getByRole('checkbox')).not.toBeChecked()
    // El link va FUERA del rótulo de la casilla: tocarlo no la tilda.
    const terms = canvas.getByRole('link', { name: /términos y condiciones/i })
    await expect(terms).toHaveAttribute('href', '/terminos')
    await expect(terms.closest('label')).toBeNull()
    await expect(terms.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    // El ritmo: 12 px bajo el título de la sección.
    await expect(
      getComputedStyle(canvas.getByRole('heading', { name: 'Entrá para reservar' })).marginBottom,
    ).toBe('12px')
    // El placeholder es el ejemplo del formato: axe no lo mide.
    await expect(
      await paintedContrast(canvas.getByLabelText('Email'), '::placeholder'),
    ).toBeGreaterThanOrEqual(4.5)
  },
}

/**
 * Tocar Google sin la casilla: el error sale EN la casilla (no en un tooltip) y el foco va ahí, sin
 * vuelta al servidor (el cliente ataja la casilla; el servidor la exige igual).
 */
export const ErrorEnCasilla: Story = {
  args: { googleAction: fn(termsError) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con Google' }))

    const alert = await canvas.findByRole('alert')
    await expect(args.googleAction).not.toHaveBeenCalled()
    await expect(alert).toHaveTextContent('Tenés que aceptar los términos.')
    const box = canvas.getByRole('checkbox')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(box).toHaveAttribute('aria-describedby', alert.id)
    // El foco se pone en un efecto posterior al pintado del error: se espera, no se asume.
    await waitFor(() => expect(box).toHaveFocus())
    await expect(await paintedContrast(alert)).toBeGreaterThanOrEqual(4.5)
    // Tildarla saca el error y deja intentar de nuevo.
    await userEvent.click(box)
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}

/** Un email inválido: el error junto al campo, el foco en él y lo tipeado intacto. */
export const ErrorDeEmail: Story = {
  args: {
    action: fn(async (): Promise<GateState> => ({
      status: 'error',
      message: 'Ingresá un email válido',
      field: 'email',
      values: { firstName: 'Tomás', email: 'tomas@' },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas@')
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con mi email' }))

    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent('Ingresá un email válido')
    const email = canvas.getByLabelText('Email')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAttribute('aria-describedby', alert.id)
    await waitFor(() => expect(email).toHaveFocus())
    await expect(email).toHaveValue('tomas@')
    await expect(canvas.getByLabelText('Nombre')).toHaveValue('Tomás')
    await expect(canvas.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid')
  },
}

/** Mail enviado: título con foco, a qué dirección, la verdad de hoy, reenviar y cambiar de email. */
export const Enviado: Story = {
  args: { action: fn(sent) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas.ibanez@example.com')
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con mi email' }))

    const title = await canvas.findByRole('heading', { level: 2, name: 'Revisá tu email' })
    // El foco se pone en un efecto posterior al pintado del título: se espera, no se asume.
    await waitFor(() => expect(title).toHaveFocus())
    await expect(canvas.getByText('tomas.ibanez@example.com').closest('p')).toHaveTextContent(
      'Te mandamos un enlace a tomas.ibanez@example.com.',
    )
    await expect(canvas.getByText(/ahí confirmás la reserva/)).toBeVisible()
    const resend = canvas.getByRole('button', { name: /^Reenviar en \d+ s$/ })
    await expect(resend).toBeDisabled()
    // Deshabilitado no es ilegible: axe no mide los controles deshabilitados, esto sí.
    await expect(await paintedContrast(resend)).toBeGreaterThanOrEqual(4.5)
    await expect(canvas.getByRole('button', { name: 'Usar otro email' })).toBeEnabled()
  },
}

/** Instagram, Facebook o TikTok (lo decide el servidor): primero el email y la aclaración de Google. */
export const NavegadorInterno: Story = {
  args: { inAppBrowser: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(buttonNames(canvasElement)).toEqual([
      'Continuar con mi email',
      'Continuar con Google',
    ])
    await expect(
      canvas.getByText('Google puede no abrirse desde este navegador. Con tu email entrás igual.'),
    ).toBeVisible()
  },
}

/**
 * Sin conexión en Google: dice lo de Google ("No pudimos abrir Google…") debajo de SU botón, no lo
 * del enlace del email, y lo tipeado en Nombre y Email queda intacto.
 */
export const RedCaidaGoogle: Story = {
  args: {
    googleAction: fn(async (): Promise<GateState> => {
      throw new TypeError('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas@example.com')
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con Google' }))

    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent(
      'No pudimos abrir Google. Revisá tu conexión y probá de nuevo.',
    )
    await expect(alert.closest('form')).toBeNull()
    await expect(canvas.getByLabelText('Nombre')).toHaveValue('Tomás')
    await expect(canvas.getByLabelText('Email')).toHaveValue('tomas@example.com')
    await expect(await paintedContrast(alert)).toBeGreaterThanOrEqual(4.5)
  },
}

/** Sin conexión la action rechaza: mensaje en el formulario, lo tipeado intacto, sin error boundary. */
export const RedCaida: Story = {
  args: {
    action: fn(async (): Promise<GateState> => {
      throw new TypeError('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas@example.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con mi email' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.',
    )
    await expect(canvas.getByLabelText('Email')).toHaveValue('tomas@example.com')
    await expect(canvas.getByLabelText('Nombre')).toHaveValue('Tomás')
    await expect(canvas.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    await expect(canvas.getByRole('button', { name: 'Continuar con mi email' })).toBeEnabled()
  },
}
