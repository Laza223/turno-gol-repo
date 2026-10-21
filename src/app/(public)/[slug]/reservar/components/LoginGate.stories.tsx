import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { paintedContrast } from '@/test/contrast'
import type { GateState } from '../actions'
import LoginGate from './LoginGate'

/**
 * Las actions entran por prop (mismo patrón que ConfirmBookingButton): '../actions' es
 * `'use server'` y arrastra `node:async_hooks` si se importa como valor. El ingreso es un modal
 * (Radix Dialog): se monta en un portal sobre `document.body`, así que se consulta con `screen`, no
 * con el canvas. Él mismo fuerza el esquema oscuro, por eso el contraste da igual en los dos temas.
 */
const idle = async (): Promise<GateState> => ({ status: 'idle' })
const sent = async (): Promise<GateState> => ({
  status: 'sent',
  email: 'tomas.ibanez@example.com',
  firstName: 'Tomas Ibanez',
})

/** Abre y cierra de verdad (en la app lo controla CheckoutFlow): con él se prueba Esc y reabrir. */
function Controlled(args: React.ComponentProps<typeof LoginGate>) {
  const [open, setOpen] = useState(true)
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <button type="button" onClick={() => setOpen(true)}>
        Abrir ingreso
      </button>
      <LoginGate {...args} open={open} onOpenChange={setOpen} />
    </div>
  )
}

const meta = {
  title: 'Player/Checkout/LoginGate',
  component: LoginGate,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: fn(),
    next: '/complejo-fenix/reservar?court=101&date=2026-03-14&time=18:00&dur=60&formato=5',
    action: fn(idle),
    googleAction: fn(idle),
    withDeposit: false,
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof LoginGate>

export default meta
type Story = StoryObj<typeof meta>

/**
 * `paintedContrast` suma los fondos de los ancestros sobre blanco y no ve ni el degradado de la card
 * de vidrio ni el velo del modal (hermano, en otro portal): contra una página clara mediría un
 * fondo que no existe. Se pone detrás el color MÁS CLARO de la card (slate-900, su borde de arriba)
 * mientras se mide: si pasa ahí, pasa en todo el vidrio.
 */
async function onGlass<T>(measure: () => Promise<T>): Promise<T> {
  const previous = document.body.style.backgroundColor
  document.body.style.backgroundColor = '#0f172a'
  try {
    return await measure()
  } finally {
    document.body.style.backgroundColor = previous
  }
}

/**
 * El diálogo ya abierto del todo: Radix lo monta con un fade-in, y un `toBeVisible` durante la
 * animación lo lee con opacidad 0. Se espera a que terminen sus animaciones.
 */
const dialog = async () => {
  const el = await screen.findByRole('dialog')
  await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
  return el
}

// Los botones en orden de DOM: es el orden en que los recorren el teclado y el lector de pantalla.
// La X de cierre del primitivo se deja afuera: no es una acción del ingreso.
const buttonNames = (root: HTMLElement) =>
  within(root)
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter((t) => t !== 'Close' && t !== 'Cerrar')

/** Google y el email del mismo peso, sin casilla ni nombre; el +18 es una frase debajo. */
export const Reposo: Story = {
  play: async () => {
    const modal = within(await dialog())
    await expect(buttonNames(await dialog())).toEqual([
      'Continuar con Google',
      'Continuar con mi email',
    ])
    await expect(modal.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
    await expect(modal.getByLabelText('Email')).toBeRequired()
    await expect(modal.queryByLabelText('Nombre')).not.toBeInTheDocument()
    await expect(modal.queryByRole('checkbox')).not.toBeInTheDocument()
    // Sin seña, una línea de apoyo antes de los botones: entrar deja la reserva confirmada.
    await expect(modal.getByText('Entrás y la reserva queda confirmada.')).toBeVisible()
    // Clickwrap: el link va a una pestaña nueva y se toca con 44 px de alto.
    await expect(modal.getByText(/declarás que sos mayor de 18 años/)).toBeVisible()
    const terms = modal.getByRole('link', { name: /términos y condiciones/i })
    await expect(terms).toHaveAttribute('href', '/terminos')
    await expect(terms).toHaveAttribute('target', '_blank')
    await expect(terms.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    // El placeholder es el ejemplo del formato: axe no lo mide.
    await expect(
      await onGlass(() => paintedContrast(modal.getByLabelText('Email'), '::placeholder')),
    ).toBeGreaterThanOrEqual(4.5)
  },
}

/** Esc cierra, y la X de cierre se toca con 44 px. */
export const CierraConEscape: Story = {
  play: async () => {
    const modal = await dialog()
    const close = within(modal).getByRole('button', { name: /close|cerrar/i })
    await expect(close.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    await expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

/** Un email inválido: el error junto al campo, el foco en él y lo tipeado intacto. */
export const ErrorDeEmail: Story = {
  args: {
    action: fn(async (): Promise<GateState> => ({
      status: 'error',
      message: 'Ingresá un email válido',
      field: 'email',
      values: { email: 'tomas@' },
    })),
  },
  play: async () => {
    const modal = within(await dialog())
    await userEvent.type(modal.getByLabelText('Email'), 'tomas@')
    await userEvent.click(modal.getByRole('button', { name: 'Continuar con mi email' }))

    const alert = await modal.findByRole('alert')
    await expect(alert).toHaveTextContent('Ingresá un email válido')
    const email = modal.getByLabelText('Email')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAttribute('aria-describedby', alert.id)
    await waitFor(() => expect(email).toHaveFocus())
    await expect(email).toHaveValue('tomas@')
    await expect(await onGlass(() => paintedContrast(alert))).toBeGreaterThanOrEqual(4.5)
  },
}

/** Con seña no hay confirmación sola: la línea de apoyo que promete confirmar no está. */
export const ConSena: Story = {
  args: { withDeposit: true },
  play: async () => {
    const modal = within(await dialog())
    await expect(modal.queryByText('Entrás y la reserva queda confirmada.')).not.toBeInTheDocument()
    await expect(modal.getByRole('button', { name: 'Continuar con mi email' })).toBeEnabled()
  },
}

/**
 * Mail enviado, con seña: no promete que quede confirmada (no lo hace sola), dice que vuelve a la
 * pantalla con su cuenta y ahí paga la seña.
 */
export const EnviadoConSena: Story = {
  args: { withDeposit: true, action: fn(sent) },
  play: async () => {
    const modal = within(await dialog())
    await userEvent.type(modal.getByLabelText('Email'), 'tomas.ibanez@example.com')
    await userEvent.click(modal.getByRole('button', { name: 'Continuar con mi email' }))

    await modal.findByRole('heading', { name: 'Revisá tu email' })
    await expect(
      modal.getByText(
        'Cuando lo toques, volvés a esta pantalla con tu cuenta y ahí pagás la seña.',
      ),
    ).toBeVisible()
    await expect(modal.queryByText(/queda confirmada/)).not.toBeInTheDocument()
  },
}

/**
 * Mail enviado, sin seña: título con foco, a qué dirección, que al tocar el enlace queda confirmada.
 * Cerrar y volver a abrir sigue mostrando "Revisá tu email" (el estado vive afuera del modal).
 */
export const Enviado: Story = {
  args: { action: fn(sent) },
  play: async () => {
    const modal = within(await dialog())
    await userEvent.type(modal.getByLabelText('Email'), 'tomas.ibanez@example.com')
    await userEvent.click(modal.getByRole('button', { name: 'Continuar con mi email' }))

    const title = await modal.findByRole('heading', { name: 'Revisá tu email' })
    // El foco se pone en un efecto posterior al pintado del título: se espera, no se asume.
    await waitFor(() => expect(title).toHaveFocus())
    await expect(modal.getByText('tomas.ibanez@example.com').closest('p')).toHaveTextContent(
      'Te mandamos un enlace a tomas.ibanez@example.com.',
    )
    await expect(modal.getByText('Cuando lo toques, tu reserva queda confirmada.')).toBeVisible()
    const resend = modal.getByRole('button', { name: /^Reenviar en \d+ s$/ })
    await expect(resend).toBeDisabled()
    // Deshabilitado no es ilegible: axe no mide los controles deshabilitados, esto sí.
    await expect(await onGlass(() => paintedContrast(resend))).toBeGreaterThanOrEqual(4.5)
    await expect(modal.getByRole('button', { name: 'Usar otro email' })).toBeEnabled()

    // Cerrar y reabrir: sigue el aviso, no vuelve al formulario.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Abrir ingreso' }))
    await expect(
      await within(await dialog()).findByRole('heading', { name: 'Revisá tu email' }),
    ).toBeVisible()
  },
}

/** Instagram, Facebook o TikTok (lo decide el servidor): primero el email y la aclaración de Google. */
export const NavegadorInterno: Story = {
  args: { inAppBrowser: true },
  play: async () => {
    const modal = await dialog()
    await expect(buttonNames(modal)).toEqual(['Continuar con mi email', 'Continuar con Google'])
    await expect(
      within(modal).getByText(
        'Google puede no abrirse desde este navegador. Con tu email entrás igual.',
      ),
    ).toBeVisible()
  },
}

/** Sin conexión en Google: dice lo de Google debajo de SU botón y lo tipeado en Email queda intacto. */
export const RedCaidaGoogle: Story = {
  args: {
    googleAction: fn(async (): Promise<GateState> => {
      throw new TypeError('Failed to fetch')
    }),
  },
  play: async () => {
    const modal = within(await dialog())
    await userEvent.type(modal.getByLabelText('Email'), 'tomas@example.com')
    await userEvent.click(modal.getByRole('button', { name: 'Continuar con Google' }))

    const alert = await modal.findByRole('alert')
    await expect(alert).toHaveTextContent(
      'No pudimos abrir Google. Revisá tu conexión y probá de nuevo.',
    )
    await expect(alert.closest('form')).toBeNull()
    await expect(modal.getByLabelText('Email')).toHaveValue('tomas@example.com')
    await expect(await onGlass(() => paintedContrast(alert))).toBeGreaterThanOrEqual(4.5)
  },
}

/** Sin conexión la action rechaza: mensaje en el formulario, lo tipeado intacto, sin error boundary. */
export const RedCaida: Story = {
  args: {
    action: fn(async (): Promise<GateState> => {
      throw new TypeError('Failed to fetch')
    }),
  },
  play: async () => {
    const modal = within(await dialog())
    await userEvent.type(modal.getByLabelText('Email'), 'tomas@example.com')
    await userEvent.click(modal.getByRole('button', { name: 'Continuar con mi email' }))

    await expect(await modal.findByRole('alert')).toHaveTextContent(
      'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.',
    )
    await expect(modal.getByLabelText('Email')).toHaveValue('tomas@example.com')
    await expect(modal.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    await expect(modal.getByRole('button', { name: 'Continuar con mi email' })).toBeEnabled()
  },
}
