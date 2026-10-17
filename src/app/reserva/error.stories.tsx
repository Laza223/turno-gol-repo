import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import ReservaError from './error'

/**
 * Error boundary de /reserva/[bookingId]/*: el cierre del checkout de plata real. Manda a Mis
 * reservas, sin prometer nada sobre el pago. El mundo del portal lo pone el layout de `reserva/`
 * (acá lo pone el decorator). Reporta a Sentry en un `useEffect`; sin DSN en Storybook es un no-op.
 */
const meta = {
  title: 'Player/BookingResult/ReservaError',
  component: ReservaError,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/reserva/x/exito' } },
  },
  args: { reset: fn() },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof ReservaError>

export default meta
type Story = StoryObj<typeof meta>

export const ConDigest: Story = {
  args: { error: Object.assign(new Error('DB connection timeout'), { digest: '3f9a21bc' }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'No pudimos cargar esta página' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(
        'Fue un error de esta pantalla. Mirá en Mis reservas cómo quedó tu reserva.',
      ),
    ).toBeInTheDocument()
    // No promete nada sobre el pago.
    await expect(canvasElement).not.toHaveTextContent(/a salvo|no perdiste|escribinos/i)
    // Rojo: es un error de la pantalla.
    await expect(canvasElement.querySelector('svg')).toHaveClass('text-red-700')
    await expect(canvas.getByText('3f9a21bc')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.reset).toHaveBeenCalledTimes(1)
  },
}

export const SinDigest: Story = {
  args: { error: new Error('Unexpected render error') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Código de referencia/)).not.toBeInTheDocument()
  },
}
