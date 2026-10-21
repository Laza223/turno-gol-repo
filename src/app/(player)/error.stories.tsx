import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import PlayerError from './error'

/**
 * Error boundary del grupo (Mi cuenta, Eliminar la cuenta), en el cascarón de La Previa (lo pone
 * `layout.tsx`; acá, el decorator). Reporta a Sentry en un `useEffect`; sin DSN configurado en
 * Storybook, `captureException` es un no-op — no hace falta mockear el módulo.
 */
const meta = {
  title: 'Player/ErrorBoundary',
  component: PlayerError,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/configuracion' } },
  },
  args: {
    reset: fn(),
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerError>

export default meta
type Story = StoryObj<typeof meta>

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: '3f9a21bc' }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Dice qué pantalla no cargó, y es el único h1 (sin <main> propio anidado en el del cascarón).
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'No pudimos cargar tu cuenta' }),
    ).toBeInTheDocument()
    await expect(canvasElement.querySelector('main')).toBeNull()
    await expect(canvas.getByText('3f9a21bc')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.reset).toHaveBeenCalledTimes(1)
  },
}

export const SinDigest: Story = {
  args: {
    error: new Error('Unexpected render error'),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Código de referencia/)).not.toBeInTheDocument()
  },
}
