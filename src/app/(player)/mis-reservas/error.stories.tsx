import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import MisReservasError from './error'

/**
 * Error boundary de /mis-reservas, en el cascarón de La Previa (lo pone `layout.tsx`; acá, el
 * decorator). Dice qué pantalla no cargó: el `error.tsx` del grupo `(player)` ya no puede decir
 * "reservas" en Cuenta. Reporta a Sentry en un `useEffect`; sin DSN en Storybook es un no-op.
 */
const meta = {
  title: 'Player/MisReservas/Error',
  component: MisReservasError,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: { reset: fn() },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MisReservasError>

export default meta
type Story = StoryObj<typeof meta>

export const ConDigest: Story = {
  args: { error: Object.assign(new Error('DB connection timeout'), { digest: '3f9a21bc' }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'No pudimos cargar tus reservas' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('3f9a21bc')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Explorar complejos' })).toHaveAttribute(
      'href',
      '/explorar',
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
