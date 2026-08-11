import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { StepPayments } from './StepPayments'

/** Las Server Actions entran por prop (ver comentario en el componente). */
const meta = {
  title: 'Onboarding/StepPayments',
  component: StepPayments,
  parameters: { layout: 'padded' },
  // Paso 4 vive dentro de `.card-premium rounded-2xl p-6 md:p-8` (ver page.tsx del wizard).
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-2xl p-6 md:p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    mpConnected: false,
    mpError: null,
    finishAction: fn(async () => {}),
    setStepAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof StepPayments>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Elección por defecto ("Cobrar seña online"): el CTA primario es el link real
 * al OAuth de MP (`/api/mp/oauth-start`), NO una Server Action — se deja
 * inerte, sin clickearlo (navegaría fuera del entorno de Storybook).
 */
export const EligiendoCobrarSena: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: /conectar mercadopago/i })
    await expect(link).toHaveAttribute('href', '/api/mp/oauth-start')
    await expect(
      canvas.queryByRole('button', { name: /terminar y ver mi complejo/i }),
    ).not.toBeInTheDocument()
  },
}

/** "Sin seña por ahora": el CTA cambia a un botón que cierra el wizard. */
const sinSenaTerminando = pendingAction<void>(undefined)

export const SinSenaTerminando: Story = {
  args: { finishAction: fn(sinSenaTerminando.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /sin seña por ahora/i }))

    const finish = canvas.getByRole('button', { name: /terminar y ver mi complejo/i })
    await userEvent.click(finish)
    await expect(finish).toBeDisabled()
    // Sin release la transición queda viva: hay 4 stories después en el archivo.
    await sinSenaTerminando.release(finish)
  },
}

/** MercadoPago ya conectado (revisita del paso, o volvió del callback OAuth): un solo CTA. */
export const MercadoPagoConectado: Story = {
  args: { mpConnected: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('MercadoPago conectado.')).toBeInTheDocument()
    await expect(canvas.queryByRole('radiogroup')).not.toBeInTheDocument()
  },
}

/** Código mp_not_configured/mp_config_missing: nunca se muestra el código crudo. */
export const ErrorMercadoPagoNoDisponible: Story = {
  args: { mpError: 'mp_not_configured' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'La conexión con MercadoPago no está disponible en este momento.',
    )
  },
}

/** Cualquier otro código de error del callback OAuth: mensaje genérico de reintento. */
export const ErrorMercadoPagoGenerico: Story = {
  args: { mpError: 'mp_denied' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('No pudimos conectar MercadoPago.')
  },
}

const volviendoPagos = pendingAction({ success: true as const })

export const VolviendoAlPasoAnterior: Story = {
  args: { setStepAction: fn(volviendoPagos.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const back = canvas.getByRole('button', { name: /^volver$/i })
    await userEvent.click(back)
    await expect(back).toBeDisabled()
    // Última story del archivo: hoy es segura por posición, no por diseño.
    // Se libera igual para que reordenar exports no la vuelva a romper.
    await volviendoPagos.release(back)
  },
}
