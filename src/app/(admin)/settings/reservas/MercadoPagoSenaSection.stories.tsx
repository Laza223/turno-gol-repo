import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { MercadoPagoSenaSection } from './MercadoPagoSenaSection'

/**
 * La cuenta de MercadoPago donde entra la seña (Ajustes → Reservas y seña).
 * Desconectar sigue plegado a propósito: la regla del dueño es que la
 * consecuencia quede más clara, nunca que sea más fácil de tocar sin querer.
 * El diálogo se porta a `document.body`, así que después de abrirlo se busca
 * con `screen`.
 */
const meta = {
  title: 'Admin/Settings/MercadoPagoSenaSection',
  component: MercadoPagoSenaSection,
  parameters: { layout: 'padded' },
  args: {
    connected: true,
    disconnected: false,
    nickname: 'ELVAGON.FUTBOL',
    requiresDeposit: true,
    disconnectAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof MercadoPagoSenaSection>

export default meta
type Story = StoryObj<typeof meta>

/** Conectada y cobrando seña: dice cuál cuenta, y desconectar arranca plegado. */
export const Conectado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('ELVAGON.FUTBOL')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument()
  },
}

/** MP revocó el permiso: badge de advertencia, la causa y "Reconectar"; "Desconectar" se mantiene. */
export const Desconectado: Story = {
  args: { disconnected: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Desconectado')).toBeVisible()
    await expect(canvas.getByText(/dejó de aceptar la conexión de TurnoGol/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: /Reconectar MercadoPago/ })).toHaveAttribute(
      'href',
      '/api/mp/oauth-start',
    )
    await expect(canvas.getByRole('button', { name: /Desconectar MercadoPago/ })).toBeVisible()
  },
}

/**
 * Las consecuencias se leen antes del botón, y el botón abre un diálogo: dos
 * pasos más un confirmar, como antes de la mudanza.
 */
export const DesconectarAbierto: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Desconectar MercadoPago/ }))
    await expect(canvas.getByText(/La seña se apaga\. Si después reconectás/)).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Desconectar' }))
    const dialog = await screen.findByRole('dialog')
    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick (reduced-motion acorta la animación, no saltea ese frame) y
    // toBeVisible() lo agarra en falso negativo. Mismo idiom que FiadosList.
    await waitFor(() => expect(within(dialog).getByText('¿Desconectar MercadoPago?')).toBeVisible())
    await expect(within(dialog).getByText(/ELVAGON\.FUTBOL/)).toBeVisible()
    // Abrir el diálogo no desconecta nada: hace falta el tercer toque.
    await expect(args.disconnectAction).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver' }))
  },
}

/** Sin seña prendida no se promete apagarla. */
export const DesconectarSinSena: Story = {
  args: { requiresDeposit: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Desconectar MercadoPago/ }))
    await expect(canvas.getByText(/dejan de cobrar seña/)).toBeVisible()
    await expect(canvas.queryByText(/La seña se apaga/)).not.toBeInTheDocument()
  },
}

export const SinConectar: Story = {
  args: { connected: false, nickname: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /Conectar MercadoPago/ })).toHaveAttribute(
      'href',
      '/api/mp/oauth-start',
    )
  },
}

/** El callback de OAuth volvió con `?error=mp_already_connected&complejo=…`. */
export const CuentaDeOtroComplejo: Story = {
  args: {
    connected: false,
    nickname: null,
    error: 'mp_already_connected',
    conflictTenant: 'La Canchita',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/ya está cobrando para "La Canchita"/)
  },
}
